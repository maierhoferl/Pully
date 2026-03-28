# Library: Sort, Search & Folder Management

**Date:** 2026-03-28
**Status:** Approved

## Context

The Library tab currently has no way to sort, search, or manage folders beyond drag-dropping files into them. Users need to find specific videos quickly and organise their library without leaving the app. This spec covers three connected features: sort controls, a search/filter bar, and right-click folder management (create, rename, delete).

---

## State

Add to `src/renderer/src/store/app-store.js`:

```js
librarySort: { field: 'date', direction: 'desc' },  // field: 'date'|'name'|'folder'
librarySearch: '',

setLibrarySort: (field, direction) => set({ librarySort: { field, direction } }),
setLibrarySearch: (query) => set({ librarySearch: query }),
```

---

## Components

### `LibraryToolbar.jsx` (new)

Rendered inside the file-list column of `LibraryTab.jsx`, above the grouped file list.

**Search input**
- Placeholder: "Search title, uploader, description…"
- Indigo border + 🔍 icon highlighted when query is non-empty
- ✕ clear button appears when active
- Result count ("N results") shown beside the clear button when searching

**Sort button**
- Displays current field + directional arrow (e.g. "Date ↓")
- Clicking cycles through: `Date ↓ → Date ↑ → Name ↑ → Name ↓ → Folder A–Z → Folder Z–A → Date ↓`
- Button styled with indigo highlight when not on the default (`Date ↓`)

---

### `LibraryTab.jsx` (modified)

Replace the current `groups` construction with a `useMemo` over `libraryFiles`, `librarySort`, and `librarySearch`:

1. **Filter** — case-insensitive substring match against: `title`, `uploader`, `description`, `url`, `name` (filename), `folder`
2. **Group** — bucket filtered files by `folder` (null → `'__root'`)
3. **Sort items within each group**
   - `date`: by `mtime` descending (or ascending)
   - `name` / `folder`: by `title ?? name` alphabetically (asc or desc)
4. **Sort groups**
   - `date`: by the group's most recent `mtime`
   - `name`: by the first item's `title ?? name`
   - `folder`: by folder name alphabetically
5. **Hide empty groups** when search query is active

The folder sidebar is unaffected by search/sort — it always shows all folders with their full file counts.

---

## Folder Management

### Trigger

Right-click on a folder name in the sidebar → custom HTML context menu (positioned absolutely, closed on outside click or Escape):

| Context | Menu items |
|---------|-----------|
| Blank sidebar space | New Folder |
| Named folder | New Folder · *(separator)* · Rename · Delete |
| "All" row | New Folder only |

### New Folder

- An inline text input appears at the bottom of the folder list
- Confirmed on Enter, cancelled on Escape or blur-with-empty-value
- Calls existing `window.api.createFolder(name)` IPC

### Rename

- The folder's label becomes an inline `<input>` pre-filled with the current name
- Confirmed on Enter or blur, cancelled on Escape
- Calls new `library:renameFolder({ from, to })` IPC handler

### Delete

- Opens a small modal dialog: *"What should happen to the N file(s) in '[Folder]'?"*
- Two action buttons: **Move to Uncategorized** / **Delete files permanently**
- Cancel button
- Calls new `library:deleteFolder({ folder, strategy: 'unassign' | 'delete' })` IPC handler

---

## New IPC Handlers (main process)

Both handlers live in `src/main/ipc-handlers.js` and operate on the metadata index via `src/main/metadata-store.js`.

### `library:renameFolder`

Payload: `{ from: string, to: string }`

1. Load metadata index
2. For every entry whose `folder === from`, set `folder = to`
3. Save index
4. Re-scan library and return refreshed file list (same as `library:list`)

### `library:deleteFolder`

Payload: `{ folder: string, strategy: 'unassign' | 'delete' }`

- `unassign`: set `folder = null` for all matching entries, save index
- `delete`: delete each file from disk (`fs.unlink`), remove metadata entries
- Return refreshed file list

---

## Files to Modify / Create

| File | Change |
|------|--------|
| `src/renderer/src/store/app-store.js` | Add `librarySort`, `librarySearch`, setters |
| `src/renderer/src/components/LibraryTab.jsx` | Add toolbar, replace groups useMemo, add folder context menu |
| `src/renderer/src/components/LibraryToolbar.jsx` | New component |
| `src/main/ipc-handlers.js` | Add `library:renameFolder`, `library:deleteFolder` handlers |
| `src/main/metadata-store.js` | Add `renameFolder(from, to)` and `deleteFolder(folder)` helpers |
| `src/preload/index.js` | Expose `renameFolder` and `deleteFolder` on `window.api` |

---

## Verification

1. **Sort** — change sort to Name ↑; confirm groups reorder A–Z and items within each group reorder A–Z. Switch to Date ↓; confirm newest items/groups appear first.
2. **Search** — type a query; confirm only matching items show, non-matching groups disappear, matching term is highlighted. Clear search; confirm full list returns.
3. **New folder** — right-click sidebar blank space → New Folder → type name → Enter; folder appears in sidebar.
4. **Rename** — right-click folder → Rename → change name → Enter; sidebar and all file items update.
5. **Delete (unassign)** — right-click folder → Delete → Move to Uncategorized; files reappear under Uncategorized, folder gone from sidebar.
6. **Delete (permanent)** — right-click folder → Delete → Delete files permanently; files removed from list and disk.
7. **Sort + search together** — active sort should persist while searching; results within groups should respect active sort order.
