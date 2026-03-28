# AI Notes & Video Summary Feature Design

**Date:** 2026-03-28
**Status:** Approved

---

## Context

Pully users download videos for later reference but have no way to capture what a video was about or add personal notes alongside it. This feature adds: (1) an AI-generated summary per video using the video's metadata or native video URL, (2) user-editable bullet-point notes per video, and (3) a dedicated Notes tab that organizes all notes by folder. Notes are stored as plain markdown files alongside the video files — portable and editable in any text editor.

---

## Overview

- One `notes.md` file per library folder (including root), living inside that folder directory
- Each downloaded video is a **chapter** in `notes.md` with machine-readable HTML comment anchors, a filename/URL reference, an AI summary section, and a user notes section
- A new **Notes tab** (4th top-level tab) provides a folder-browsing UI with inline bullet editing and bidirectional navigation to/from the Library tab
- AI summaries use a shared `ai-client.js` layer (also used by auto-classification); Gemini uses YouTube URL directly, others use text metadata
- A per-folder `summary-prompt.md` overrides the global default prompt from Settings
- Download pipeline order: classify → summarize, so the summary always uses the correct folder's prompt

---

## Markdown File Format

### `notes.md` location
- Named folders: `{outputFolder}/{FolderName}/notes.md`
- Root (uncategorized): `{outputFolder}/notes.md`

### Chapter structure

```markdown
# Folder Name

---

## Video Title
<!-- pully:file:video.mp4 -->
<!-- pully:url:https://youtube.com/watch?v=abc123 -->
<!-- pully:downloaded:2026-03-28 -->

### AI Summary
Comprehensive overview of a 10-day journey through Japan...

### My Notes
- Shinkansen day pass is worth it if you travel between 3+ cities
- Best ramen in Shinjuku: Fuunji
- Bring cash, many places don't take cards

---
```

**Parsing rules:**
- Chapters are delimited by `## ` headings and `---` separators
- `<!-- pully:key:value -->` comments are the machine-readable anchors; never modified by the user
- The app surgically updates only the `### AI Summary` content and `### My Notes` bullet list; all surrounding content is preserved
- If the user renames a chapter heading manually, the `<!-- pully:file: -->` comment remains the stable identity anchor

### `summary-prompt.md` location
- `{outputFolder}/{FolderName}/summary-prompt.md`
- Plain text / markdown prompt. If absent, the global default from config is used.

---

## Download Pipeline (ordered)

When a download completes:

```
1. writeMetadataEntry()          — always
2. notes:init-chapter            — always (creates chapter stub in notes.md)
3. [if autoClassifyEnabled]
     classifyVideo()             — moves file to matched folder
     moveMetadataEntry()
     move chapter to correct notes.md
4. [if autoSummarizeEnabled]
     read summary-prompt.md from final folder (or global default)
     ai-summarizer.generateSummary()
     notes-store.writeSummarySection()
```

If `autoClassifyEnabled` is false and `autoSummarizeEnabled` is true, the summary is generated for the folder the file currently resides in. If both are disabled, only the chapter stub is created.

---

## Architecture

### New files

| File | Responsibility |
|------|---------------|
| `src/main/ai-client.js` | Shared LLM calling for all providers. Exports: `callLLM(provider, apiKey, model, messages)`, `callLLMWithVideo(provider, apiKey, model, prompt, videoUrl)` (Gemini YouTube path), `fetchProviderModels(provider, apiKey)` |
| `src/main/ai-summarizer.js` | Builds summarization prompt, calls `ai-client.js`. For Gemini + YouTube URL: uses `callLLMWithVideo`. For Claude/OpenAI: uses `callLLM` with title+description+uploader as text. Returns summary string. |
| `src/main/notes-store.js` | Read, parse, write `notes.md`. Operations: `initChapter`, `writeSummarySection`, `writeBulletsSection`, `moveChapter` (when classify moves a file), `readFolder`. Surgical updates only — never rewrites unrelated sections. |
| `src/renderer/src/components/NotesTab.jsx` | Top-level Notes tab. Two-panel layout: folder list (left) + chapter view (right). |
| `src/renderer/src/components/NotesFolderList.jsx` | Left panel: lists all folders with a `notes.md`. Highlights active folder. |
| `src/renderer/src/components/NotesChapterView.jsx` | Right panel: renders all chapters for the active folder. Inline bullet editing, Generate/Regenerate Summary button per chapter, "Play in Library" link. |

### Modified files

| File | Change |
|------|--------|
| `src/main/ipc-handlers.js` | Add: `notes:read`, `notes:init-chapter`, `notes:update-bullets`, `notes:generate-summary` |
| `src/preload/index.js` | Expose notes APIs: `readNotes`, `initChapter`, `updateBullets`, `generateSummary` |
| `src/renderer/src/store/app-store.js` | Add: `activeNotesFolder`, `activeNotesChapter` state + setters |
| `src/renderer/src/components/App.jsx` | Add Notes tab to tab bar |
| `src/renderer/src/components/LibraryDetailPanel.jsx` | Add "View Notes" button → switches to Notes tab and scrolls to chapter |
| `src/renderer/src/components/SettingsPanel.jsx` | Add unified AI section (shared with auto-classify): provider dropdown, API key input, model dropdown, auto-summarize toggle, default summary prompt textarea |
| `src/main/config-store.js` | Add new config fields (see Config section) |
| `src/main/download-manager.js` | After `writeMetadataEntry`: call `initChapter`, then classify (if enabled), then `generateSummary` (if enabled) |
| `src/main/auto-classifier.js` *(new, from auto-classify spec)* | Import `callLLM` and `fetchProviderModels` from `ai-client.js` instead of implementing inline |

---

## Config

New fields added to `config-store.js` defaults. These **replace** the `autoClassifyProvider/ApiKey/Model` fields from the auto-classification spec (unified):

```javascript
// Shared AI config (used by both classify and summarize)
aiProvider: 'gemini' | 'claude' | 'openai'   // default: 'gemini'
aiApiKey: string                               // default: ''
aiModel: string                               // default: '' (uses per-provider default)

// Feature toggles
autoClassifyEnabled: boolean                  // default: false
autoSummarizeEnabled: boolean                 // default: false

// Summary prompt
defaultSummaryPrompt: string                  // default: see below
```

**Default summary prompt:**
```
Summarize this video in 3-5 sentences. Highlight the main topic, key points covered,
and anything particularly useful or actionable for the viewer.
```

---

## IPC Surface

```
notes:read(folderName)           // folderName: string | null (null = root)
  → { title: string, chapters: Chapter[] }
  // Chapter: { file: string, url: string, downloadedAt: string,
  //            summary: string | null, bullets: string[] }

notes:init-chapter(filePath)
  → void  (creates stub in notes.md for that file's folder; no-op if chapter already exists)

notes:update-bullets(filePath, bullets: string[])
  → void  (surgically rewrites "### My Notes" section only)

notes:generate-summary(filePath)
  → { summary: string }  (writes to notes.md, returns text for UI update)
```

---

## AI Summarization

### Gemini — YouTube URL path
```javascript
// Uses Gemini's native video understanding
{
  parts: [
    { fileData: { mimeType: "video/mp4", fileUri: youtubeUrl } },
    { text: promptText }
  ]
}
```
Falls back to text metadata if the URL is not a YouTube URL or if the request fails.

### Claude / OpenAI — text metadata path
Prompt constructed from: `title`, `uploader`, `description` (first 500 chars), plus the folder's `summary-prompt.md` or global default.

### Default models
| Provider | Default Model |
|----------|--------------|
| Gemini   | `gemini-2.0-flash` |
| Claude   | `claude-haiku-4-6` |
| OpenAI   | `gpt-4o-mini` |

Model is user-selectable via dropdown populated by `fetchProviderModels` after API key entry.

---

## UI

### Notes Tab — two-panel layout

```
[ Browser ] [ Downloads ] [ Library ] [ Notes ]

┌─────────────────┬──────────────────────────────────────────┐
│ Folders          │  Travel Videos — notes.md               │
│                  │                                          │
│ ▸ (root)         │  ## Japan Trip 2024                     │
│ ▸ Travel Videos  │  📁 Japan Trip 2024.mp4  🔗 youtube.com │
│ ▸ Cooking        │  [▶ Play in Library]                    │
│ ▸ Programming    │                                          │
│                  │  ### AI Summary                         │
│                  │  Comprehensive overview of a 10-day...  │
│                  │  [↻ Regenerate]                         │
│                  │                                          │
│                  │  ### My Notes                           │
│                  │  • Shinkansen pass worth it             │
│                  │  • Best ramen: Fuunji Shinjuku          │
│                  │  [+ Add bullet]  [✎ Edit]               │
│                  │                                          │
│                  │  ───────────────────────────────────     │
│                  │  ## Kyoto Guide                         │
│                  │  ...                                     │
└─────────────────┴──────────────────────────────────────────┘
```

### Bidirectional navigation
- **Library → Notes**: "View Notes" button in `LibraryDetailPanel` switches to Notes tab, sets `activeNotesFolder` + `activeNotesChapter`, right panel scrolls to that chapter's anchor
- **Notes → Library**: "▶ Play in Library" button in each chapter switches to Library tab and selects that file

### Inline bullet editing
- "Edit" button makes the `### My Notes` section a textarea
- "Save" calls `notes:update-bullets` — only rewrites that section
- "Cancel" discards changes

### AI Summary states
- No summary yet → "Generate Summary" button
- Generating → spinner + "Generating…" text
- Done → summary text + "↻ Regenerate" button
- Error → error message + "Retry" button

### Settings panel — AI section
- **Provider** dropdown: Gemini / Claude / OpenAI (default: Gemini)
- **API Key** input (password field)
- **Model** dropdown (populated after key entry; free-text fallback)
- **Auto-summarize new downloads** toggle
- **Default summary prompt** textarea
- Note: *"Override per folder by adding a `summary-prompt.md` file inside that folder"*

---

## Verification

1. **Chapter init**: Download a video. Verify `notes.md` in the file's folder is created/updated with a new chapter stub (file ref, URL, empty AI summary + notes sections).
2. **Classify-then-summarize ordering**: Enable both auto-classify and auto-summarize. Download a video matching a folder. Verify the chapter appears in the *target* folder's `notes.md` (not root), and the summary uses that folder's prompt.
3. **Gemini YouTube path**: Configure Gemini with a valid API key. Generate a summary for a YouTube-sourced video. Verify the API call uses the video URL (check via network inspector or log).
4. **Text fallback**: Generate a summary for a non-YouTube video. Verify the API call uses text metadata.
5. **Custom prompt**: Add `summary-prompt.md` to a folder. Generate a summary for a video in that folder. Verify the output reflects the custom prompt vs. the default.
6. **Bullet editing**: Add bullets to a chapter. Open `notes.md` in a text editor. Verify only the `### My Notes` section changed; AI summary and metadata comments are intact.
7. **Bidirectional nav**: Click "View Notes" in Library detail panel. Verify Notes tab opens and scrolls to correct chapter. Click "Play in Library" from Notes. Verify Library tab selects the file.
8. **Regenerate**: Click "↻ Regenerate" on an existing summary. Verify the summary updates in the UI and in `notes.md`.
9. **No API key**: Attempt to generate a summary with no API key configured. Verify a clear error message is shown, not a crash.
10. **Manual edit resilience**: Manually edit `notes.md` to change chapter heading text. Verify app still finds the chapter by `<!-- pully:file: -->` anchor, not the heading text.
