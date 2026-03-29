# Auto-Classification Feature Design

**Date:** 2026-03-28
**Status:** Approved

---

## Context

Pully users who maintain folders (e.g. "Music", "Cooking", "Programming") currently have to drag-and-drop every downloaded video into the right folder manually. This is tedious at scale. Auto-classification automatically moves newly downloaded videos into the best-matching folder, and provides a manual batch button to classify any uncategorized videos already in the library.

---

## Overview

A 3-tier hybrid classification pipeline assigns each video to the best-matching existing folder, or leaves it uncategorized if confidence is low. Classification can run automatically after each download (opt-in toggle) and on-demand via a batch button in the Library tab. No preview — moves happen immediately.

---

## Classification Pipeline

Classification input per video: `title`, `uploader`, `description` (first 300 chars), `url` domain.
Classification input for context: list of existing folder names.
Output: `{ folder: string | null, tier: 'keyword' | 'embedding' | 'llm' | 'none' }`.

### Tier 1 — Keyword Match (~0ms, always runs)

Tokenize folder names (e.g. "Cooking & Food" → `["cooking", "food"]`). Count token hits in the normalized metadata blob. If the top folder has ≥ 2 hits, or has ≥ 1 hit and its score is at least 2× the second-best folder's score, assign it. Covers ~60% of obvious cases instantly.

### Tier 2 — Local Semantic Embeddings (~100–300ms first call, ~10ms after)

Uses `@huggingface/transformers` with ONNX model `all-MiniLM-L6-v2` (~23MB, CPU-only). Lazy-loaded on first use, cached in module scope for the session. Encodes the video as `"{title} by {uploader}. {description[:200]}"` and each folder name as a separate embedding. Assigns the folder with highest cosine similarity if it clears **0.45** threshold. Handles semantic matches Tier 1 misses (e.g. "My Hero Academia ep 12" → "Anime").

### Tier 3 — Cloud LLM (only when provider configured and Tier 2 below threshold)

Invoked only when:

- `autoClassifyProvider !== 'local'`
- A valid API key is configured
- Tier 2 best similarity < 0.45

Sends a minimal prompt:

```
Folders: Music, Cooking, Programming, Gaming
Video: "Baked sourdough recipe" by "Joshua Weissman". Description: "Step by step..."
Reply with exactly one folder name from the list, or "none".
```

**Default models:**
| Provider | Default Model |
|----------|--------------|
| Claude | `claude-haiku-4-6` |
| Gemini | `gemini-3.1-flash-lite` |
| OpenAI | `gpt-5-nano` |

Model is user-selectable via a dropdown populated dynamically from the provider's API after an API key is entered. Falls back to a free-text input if the fetch fails.

If all tiers produce low confidence → leave file uncategorized (no move).
Confidence thresholds are hardcoded; no user-facing knob.

---

## Config

Four new fields added to `config-store.js`:

```javascript
autoClassifyEnabled: boolean // default: false
autoClassifyProvider: string // 'local' | 'claude' | 'gemini' | 'openai', default: 'local'
autoClassifyApiKey: string // default: ''
autoClassifyModel: string // default: '' (uses per-provider default)
```

---

## Architecture

### New file: `src/main/auto-classifier.js`

Single-responsibility module. Public API:

```javascript
classifyVideo(videoEntry, folderNames, config)
  → Promise<{ folder: string | null, tier: string }>

fetchProviderModels(provider, apiKey)
  → Promise<string[]>
```

Holds lazy-loaded embedding pipeline in module scope. No state beyond the cached model.

### Modified files

| File                                            | Change                                                              |
| ----------------------------------------------- | ------------------------------------------------------------------- |
| `src/main/config-store.js`                      | Add 4 new config fields with defaults                               |
| `src/main/ipc-handlers.js`                      | Add `library:autoClassify` and `classify:fetchModels` handlers      |
| `src/main/download-manager.js`                  | Call `classifyVideo()` after `writeMetadataEntry()` when enabled    |
| `src/preload/index.js`                          | Expose `autoClassify()` and `fetchClassifyModels()` on `window.api` |
| `src/renderer/src/components/SettingsPanel.jsx` | Add "Auto-classify" settings section                                |
| `src/renderer/src/components/LibraryTab.jsx`    | Add "Auto-classify" button + status line to toolbar                 |
| `src/renderer/src/store/app-store.js`           | Persist `config` fields (already handled by generic config flow)    |

---

## IPC Surface

```
classify:fetchModels(provider, apiKey)  → string[]
library:autoClassify()                  → { moved: [{file, toFolder}][], skipped: number }
```

`library:autoClassify` reads all root-level video files, runs the classification pipeline on each, moves matches via `fs.renameSync()` + `moveMetadataEntry()`.

Auto-on-download runs entirely in the main process after download completion — no new IPC needed.

---

## UI

### Settings panel — new "Auto-classify" section

- Toggle: **Auto-classify new downloads** (`autoClassifyEnabled`)
- Dropdown: **Provider** — Local only / Claude / Gemini / OpenAI (visible always)
- **API Key** text input (hidden when "Local only")
- **Model** dropdown — populated by `classify:fetchModels` after key entry; pre-selects provider default; falls back to free-text input on fetch failure (hidden when "Local only")

### Library tab — toolbar addition

- **"Auto-classify" button** next to existing refresh button
- Disabled when no root-level (uncategorized) videos exist
- After `library:autoClassify` resolves: inline status "Moved 4 videos · 2 skipped" visible for 3 seconds

---

## Verification

1. **Keyword tier**: Create folders "Music" and "Gaming". Add a video with title "Guitar Solo Practice". Run auto-classify. Verify it lands in "Music" without an API call.
2. **Embedding tier**: Create folder "Anime". Add a video titled "Attack on Titan Season 4 Episode 3" (no folder keyword match). Verify it moves to "Anime".
3. **LLM tier**: Create folder "Cooking". Add a video titled "The perfect carbonara" with no description. Disable local embedding (or set threshold artificially high). Configure a cloud provider + key. Verify the video moves to "Cooking".
4. **No match**: Create folder "Travel". Add a video titled "Advanced calculus lecture 7". Verify it stays uncategorized.
5. **Auto on download**: Enable `autoClassifyEnabled`. Download a video. Verify it auto-moves without pressing the batch button.
6. **Batch button**: Leave `autoClassifyEnabled` off. Download several videos. Click "Auto-classify" in Library. Verify all eligible videos move and status line shows correct counts.
7. **Model fetch**: Enter a valid API key for any provider. Verify the model dropdown populates with real model names from that provider.
8. **No folders**: Verify classification is skipped gracefully when the library has no folders.
