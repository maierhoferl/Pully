# Files Tab Design — Pully

**Date:** 2026-03-30
**Status:** Design Phase

---

## Context

Pully currently supports importing videos via the Browser tab (yt-dlp downloads) and remembering web content (bookmarks, saved pages). This design adds a **Files tab** to import local files from the user's filesystem. Users will browse directories, select individual files or entire folders, and import them into the Pully library. Files are converted to AI-friendly formats (for documents) and previewed natively in the right panel, with AI summaries available. Imported files are tracked in the library alongside videos and web content.

---

## Overview

### Tab Structure

The **Files tab** is added after the Browser tab in the tab order. It follows the same two-pane layout as the Library tab:

```
┌────────────────────────────────────────────────────────────┐
│  [Folder Tree       │ [File List      ║ [Detail Panel  ║  │
│   ~200px fixed]    │  flex-1]        ║                ║  │
│                    │                 ║ [Preview       ║  │
│  📁 /Users/lorenz  │ 📄 report.pdf ✓ ║  Top ~60%]     ║  │
│  ├─ 📁 Documents   │ 🖼 photo.jpg    ║                ║  │
│  ├─ 📁 Downloads   │ 📄 notes.docx   ║ [Divider]      ║  │
│  └─ 📁 Desktop     │ 📁 Subfolder/   ║                ║  │
│                    │                 ║ [AI Summary    ║  │
│                    │                 ║  Bottom ~40%]  ║  │
└────────────────────────────────────────────────────────────┘
```

### Components

1. **Left side** (fixed ~200px):
   - **Folder tree:** filesystem hierarchy with collapsible folders
   - **Breadcrumb bar** at the top: segments of the current path; click to navigate up
   - Restores last-browsed folder on tab re-open

2. **Middle** (flex-1):
   - **File list:** all files in the selected folder + immediate subfolders
   - Shows files with type icon (📄📑🖼📁)
   - **Badge indicator (✓):** files already remembered by Pully show a checkmark
   - Supports click-to-select (highlights file, populates right panel)
   - Folder items show count and are clickable to navigate into them

3. **Right side** (draggable split divider, same pattern as Library):
   - Top ~60%: **LibraryDetailPanel** adapted for Files (shows native preview + metadata)
   - Draggable row-resize divider
   - Bottom ~40%: **LibraryNotesPanel** (AI summary bullets)

4. **Dividers:**
   - Vertical draggable divider between left (tree) and middle (file list), default ~200px
   - Horizontal draggable divider between preview (~60%) and summary (~40%)
   - Same pattern as existing Library tab

---

## File Types & Content Detection

Files are categorized by extension:

### Document Types (Converted to `.md`)

| Extension                                | Handler                 | Output             |
| ---------------------------------------- | ----------------------- | ------------------ |
| `.pdf`                                   | `@llamaindex/liteparse` | Extracted markdown |
| `.docx`, `.docm`, `.doc`, `.odt`, `.rtf` | `officeparser`          | Extracted markdown |
| `.pptx`, `.pptm`, `.ppt`, `.odp`         | `officeparser`          | Extracted markdown |
| `.xlsx`, `.xlsm`, `.xls`, `.ods`         | `officeparser`          | Extracted markdown |

These are extracted to `.md` files and stored in the Pully folder. The original file path is kept in metadata (`originalPath`) for native preview and file reveal-in-finder.

### Reference Types (Stored as `.ref`)

Images and plain text are stored as reference files (no conversion):

| Extension                                                                                   | Content Type | Storage                      |
| ------------------------------------------------------------------------------------------- | ------------ | ---------------------------- |
| `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.bmp`, `.svg`, `.tiff`, `.heic`, `.ico`, `.avif` | `image`      | `.ref` file (reference only) |
| `.txt`, `.csv`, `.json`, `.xml`, `.yaml`, `.md`, `.html`                                    | `text`       | `.ref` file (reference only) |

### Unsupported

Other file types (e.g., `.exe`, `.dmg`, `.zip`, binaries) are greyed out and cannot be selected.

---

## Import Pipeline

### Single File Import

**IPC Call:** `files:rememberFile(filePath)`

1. Detect content type by extension
2. If document (PDF, DOCX, etc.):
   - Extract via LiteParse (PDF) or officeparser (Office)
   - Write extracted markdown to `<outputFolder>/<filename>.md`
   - Record `originalPath` in metadata
3. If image or text:
   - Create a `.ref` reference file at `<outputFolder>/<filename>.ref`
   - Record `originalPath` in metadata
4. Write metadata entry to `<userData>/metadata-index.json` with:
   - `title` (derived from filename)
   - `contentType` (`document`, `image`, `text`)
   - `originalPath` (absolute path to original file on disk)
   - `downloadedAt` (current timestamp)
5. Download and store thumbnail (if available from file preview)
6. Emit `library:changed` event to refresh Library tab listing

**On Success:** Badge on file turns to ✓. UI updates showing file is now in library.

---

### Folder Import (Recursive)

**IPC Call:** `files:rememberFolder(folderPath)`

1. Recursively count all files in the folder + subfolders
2. Return `{ count, files: [] }` (list without processing)
3. **If count > 10:** Renderer shows confirmation dialog:
   ```
   "This folder contains 47 files. Processing may take a moment. Continue?"
   [Cancel]  [Proceed]
   ```
4. If "Proceed," process each file individually via `files:rememberFile()`, one-by-one, with progress feedback
5. After all complete, emit `library:changed` event

---

## State & Persistence

**Local state** (FilesTab component):

- `selectedPath` — currently selected file path
- `currentFolder` — currently browsing folder path
- `sideWidth` — right panel width (draggable, persisted to store)
- `sideSplitPct` — preview/summary split ratio (draggable, persisted to store)

**Persisted state** (Zustand):

- `filesLastDir` — last browsed folder path (restored on tab re-open)
- `filesSideWidth` — right panel width
- `filesSideSplitPct` — preview/summary split

**Filesystem helpers:**

- New IPC handler `files:getLastDir()` — read from config
- New IPC handler `files:setLastDir(path)` — persist to config

---

## Right Panel (Preview & Summary)

When a file is selected, the right panel displays:

### Top: LibraryDetailPanel (adapted)

Shows native preview based on content type:

**Images:** Native `<img>` element, aspect-ratio-fit

**Documents (PDFs, DOCX, etc.):**

- If `.md` file exists in pully folder (converted), show a **read-only markdown preview** (using existing markdown renderer)
- **Metadata bar** below: original filename, import date, file size, original file path (click to reveal in Finder)

**Text/Reference files:**

- Show **read-only markdown preview** of the `.ref` file content
- **Metadata bar:** original filename, import date, file size

**Existing buttons:** Delete, Reveal in Finder (now points to `originalPath`)

### Bottom: LibraryNotesPanel

Shows AI summary bullets for the selected file (same as Library tab). AI summary is generated from the extracted `.md` content (for documents) or the `.ref` content (for images/text).

---

## Broken Helper Files

The `isHelperFile` exclusion list in `ipc-handlers.js` currently excludes all `.md` files. This must be updated to:

**Only exclude `notes.md`** (the folder-level notes helper file), not all `.md` files.

Updated `isHelperFile` logic:

```javascript
const isHelperFile = (fileName) => {
  if (fileName === 'notes.md') return true // Folder-level notes file
  if (fileName === '.pully.json') return true
  if (fileName === '.gitignore') return true
  if (/\.thumb(\.[a-z]+)?$/i.test(fileName)) return true // Thumbnails
  if (/\.nfo$/i.test(fileName)) return true // Info files
  return false
}
```

This allows imported documents (stored as `.md`) to appear in the library listing, while keeping internal helper files hidden.

---

## Browser Tab Integration

The Files tab is independent of the Browser tab. Both lead to entries in the Library:

- Browser → Download (video) or Remember (page content) → Library entry
- Browser → Bookmark → separate bookmark data
- Files → Import (document/image) → Library entry

No cross-tab concerns.

---

## Error Handling

**File not found:** If the original file path (stored in `originalPath`) no longer exists when the user tries to preview or reveal-in-finder, show a friendly error: "Original file not found. It may have been moved or deleted. You can delete this entry or export the extracted content."

**Extraction failure:** If LiteParse or officeparser fails on a file, show an error dialog with the reason and offer to skip or retry.

**Folder import cancellation:** If the user cancels a folder import mid-process, the UI shows "Import cancelled. X files processed, Y remaining." Partially imported files remain in the library.

---

## Testing Checklist

**File Selection & Navigation:**

- [ ] Folder tree is collapsible and navigable
- [ ] Breadcrumb updates as you navigate
- [ ] Last folder is restored on tab re-open
- [ ] File list updates as you change folders
- [ ] Files already in library show ✓ badge

**Single File Import:**

- [ ] PDF → extracted `.md` + reference metadata
- [ ] DOCX → extracted `.md` + reference metadata
- [ ] Image → `.ref` file + metadata
- [ ] Text file → `.ref` file + metadata
- [ ] File appears in Library tab immediately after import
- [ ] File deletion via right panel works

**Folder Import:**

- [ ] Folder with ≤10 files: imports without dialog
- [ ] Folder with >10 files: shows confirmation dialog
- [ ] Cancel dialog prevents import
- [ ] Proceed imports all files recursively, showing progress
- [ ] All imported files appear in Library

**Right Panel Preview:**

- [ ] Images render natively
- [ ] Documents show markdown preview
- [ ] AI summary loads and displays
- [ ] Delete button works
- [ ] Reveal in Finder opens the original file location

**Metadata & Sync:**

- [ ] Library tab shows all imported files
- [ ] Metadata-index.json has correct entries
- [ ] Exported markdown content is AI-friendly (no binary junk)

**Edge Cases:**

- [ ] Unsupported file types are greyed out
- [ ] File with no extension is handled gracefully
- [ ] Very large PDFs don't freeze the app
- [ ] Folder with symlinks doesn't cause infinite loops
- [ ] Network file paths (SMB, NFS) work if accessible

---

## Critical Files to Modify

| File                                                 | Role              | Changes                                                   |
| ---------------------------------------------------- | ----------------- | --------------------------------------------------------- |
| `src/renderer/src/components/FilesTab.jsx`           | New tab component | Create with tree + file list + detail panel               |
| `src/renderer/src/components/FileTree.jsx`           | New sub-component | Recursive folder tree, collapsible                        |
| `src/renderer/src/components/FileList.jsx`           | New sub-component | File listing for current folder                           |
| `src/renderer/src/store/app-store.js`                | State             | Add `filesLastDir`, `filesSideWidth`, `filesSideSplitPct` |
| `src/preload/index.js`                               | IPC bridge        | Expose new file handlers                                  |
| `src/main/ipc-handlers.js`                           | IPC handlers      | Add `files:*` handlers                                    |
| `src/main/file-processor.js`                         | New module        | Orchestrate LiteParse + officeparser extraction           |
| `src/renderer/src/components/TabBar.jsx`             | Tab list          | Add Files tab to `TABS` constant                          |
| `src/renderer/src/components/LibraryDetailPanel.jsx` | Existing          | Adapt to show `originalPath` preview                      |
| `src/main/ipc-handlers.js`                           | Existing          | Update `isHelperFile` to allow `.md` imports              |

---

## System Dependencies

**Optional:**

- `@llamaindex/liteparse` (already npm package, no system deps for PDFs)

**Required:**

- `officeparser` (pure Node.js, handles DOCX/PPTX/XLSX/ODT/RTF)

---

## Out of Scope (Future Work)

- Drag-and-drop file import (can be added later)
- Watch for file changes on disk and auto-sync (expensive, future enhancement)
- Bulk edit (rename, move, tag) imported files in the Files tab
- Advanced search/filter in Files tab (can be added later)
