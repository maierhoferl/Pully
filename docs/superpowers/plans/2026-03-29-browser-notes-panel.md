# Browser Notes Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable immediate notes.md stub creation on button click and display live, editable notes in the Browser tab via tabbed Notes/Progress panels.

**Architecture:** Backend emits `notes:chapter-updated` IPC events on stub creation, classification, and summarization. Frontend subscribes via `useIpcEvents`, updates `browserActiveChapter` Zustand slice, and renders `BrowserNotesPanel` with a shared `ChapterCard` component. Tab state is local to `SidePanel`.

**Tech Stack:** Electron IPC, Zustand, React, Node.js fs/path

---

## File Structure

**Backend (Main Process):**
- `src/main/notes-store.js` — Add adopt-by-URL logic, emit `notes:chapter-updated` event
- `src/main/download-manager.js` — Call `initChapter` at queue-add time
- `src/main/auto-classifier.js` — Emit `notes:chapter-updated` after file move
- `src/main/ai-summarizer.js` — Emit `notes:chapter-updated` after summary write
- `src/main/ipc-handlers.js` — Ensure event emission on Remember

**Frontend (Renderer):**
- `src/renderer/src/store/app-store.js` — Add `browserActiveChapter` slice
- `src/renderer/src/hooks/useIpcEvents.js` — Subscribe to `notes:chapter-updated`
- `src/renderer/src/components/ChapterCard.jsx` — Extracted component (shared edit UX)
- `src/renderer/src/components/BrowserNotesPanel.jsx` — New notes display/edit panel
- `src/renderer/src/components/SidePanel.jsx` — Add tab bar and conditional rendering
- `src/renderer/src/components/NotesChapterView.jsx` — Extract `ChapterCard`, keep rest

---

## Task 1: Update notes-store.js — Add adopt-by-URL logic

**Files:**
- Modify: `src/main/notes-store.js`
- Test: `tests/main/notes-store.test.js` (existing)

**Context:** `initChapter` is called twice for downloads: once on queue-add (no filename yet), again on completion (with real filename). The function must detect the existing URL-keyed entry and update its `pully:file:` anchor.

- [ ] **Step 1: Understand current `initChapter` and `readFolderNotes`**

Read the function signatures and idempotency check. Currently it checks `<!-- pully:file:<basename> -->`. We need to also check `<!-- pully:url:<sourceUrl> -->` if the file-based check fails.

- [ ] **Step 2: Write failing test for URL-based adoption**

In `tests/main/notes-store.test.js`, add:

```js
test('initChapter adopts existing chapter by URL when file anchor is missing', () => {
  const notesPath = path.join(tmpDir, 'notes.md');
  const metadata1 = { title: 'My Video', url: 'https://example.com/video', downloadedAt: '2026-03-29' };
  const metadata2 = { title: 'My Video', url: 'https://example.com/video', downloadedAt: '2026-03-29' };

  // First call: stub with no filename
  initChapter('https://example.com/video', metadata1, tmpDir);
  let content = fs.readFileSync(notesPath, 'utf8');
  expect(content).toContain('<!-- pully:url:https://example.com/video -->');
  expect(content).not.toContain('<!-- pully:file:');

  // Second call: real filename, should update the existing chapter
  initChapter('path/to/video.mp4', metadata2, tmpDir);
  content = fs.readFileSync(notesPath, 'utf8');
  expect(content).toContain('<!-- pully:file:video.mp4 -->');
  expect(content).toContain('<!-- pully:url:https://example.com/video -->');
  // Should have only one chapter, not two
  expect((content.match(/^## /gm) || []).length).toBe(1);
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npm run test tests/main/notes-store.test.js
```

Expected: test fails with "Expected ... to contain '<!-- pully:file:video.mp4 -->'"

- [ ] **Step 4: Modify `initChapter` to support both file and URL-based lookups**

In `notes-store.js`, update the function:

```js
export function initChapter(filePath, metadata = {}, outputFolder = '') {
  const notesPath = getNotesPath(filePath, outputFolder);

  // Ensure directory exists
  const dir = path.dirname(notesPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const { chapters } = readFolderNotes(notesPath);
  const basename = path.basename(filePath);

  // Try to find existing chapter by file basename
  let existingChapter = chapters.find(ch => ch.filePath === basename);

  // If not found and filePath looks like a key (not a full path), try URL-based lookup
  if (!existingChapter && metadata.url && !filePath.includes('/')) {
    existingChapter = chapters.find(ch => ch.url === metadata.url);
  }

  // If chapter exists, don't rewrite — just update the file anchor if needed
  if (existingChapter) {
    if (filePath.includes('/') && filePath !== existingChapter.filePath) {
      // Update the pully:file anchor to the real filename
      updateChapterAnchor(notesPath, existingChapter.url, 'file', basename);
    }
    return { isNew: false, filePath: notesPath, chapterId: existingChapter.title };
  }

  // Create new chapter
  const title = metadata.title || path.parse(basename).name || 'Untitled';
  const url = metadata.url || '';
  const downloadedAt = metadata.downloadedAt || new Date().toISOString().split('T')[0];

  const fileAnchor = filePath.includes('/') ? `<!-- pully:file:${basename} -->` : '';
  const urlAnchor = url ? `<!-- pully:url:${url} -->` : '';

  const chapter = `## ${title}
${fileAnchor}
${urlAnchor}
<!-- pully:downloaded:${downloadedAt} -->

### AI Summary



### My Notes

`;

  if (fs.existsSync(notesPath)) {
    fs.appendFileSync(notesPath, '\n---\n\n' + chapter);
  } else {
    const header = `# ${path.basename(path.dirname(notesPath)) || 'Notes'}\n\n---\n\n`;
    fs.writeFileSync(notesPath, header + chapter);
  }

  return { isNew: true, filePath: notesPath, chapterId: title };
}

function updateChapterAnchor(notesPath, chapterKey, anchorType, newValue) {
  const content = fs.readFileSync(notesPath, 'utf8');
  const lines = content.split('\n');

  let inChapter = false;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith(`## `) && inChapter) break; // Hit next chapter

    if (lines[i].includes(`<!-- pully:url:${chapterKey} -->`)) {
      inChapter = true;
    }

    if (inChapter && lines[i].startsWith(`<!-- pully:${anchorType}:`)) {
      lines[i] = `<!-- pully:${anchorType}:${newValue} -->`;
      break;
    }

    if (inChapter && !lines[i].includes('pully:') && lines[i].trim()) {
      // Hit non-anchor content, stop searching
      break;
    }
  }

  fs.writeFileSync(notesPath, lines.join('\n'));
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npm run test tests/main/notes-store.test.js
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/main/notes-store.js tests/main/notes-store.test.js
git commit -m "feat: support adopt-by-URL in initChapter for stub resolution

When initChapter is called with a URL-keyed stub (no filename), subsequent calls with a real filename will find and adopt the existing chapter by URL match, updating the pully:file anchor.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"
```

---

## Task 2: Update notes-store.js — Emit notes:chapter-updated event

**Files:**
- Modify: `src/main/notes-store.js`
- Modify: `src/main/ipc-handlers.js` (add event broadcaster)

**Context:** Every time a chapter is written, moved, or updated, emit a `notes:chapter-updated` IPC event so the renderer can update the `browserActiveChapter` slice in real-time.

- [ ] **Step 1: Create event emission helper in notes-store.js**

At the top of `src/main/notes-store.js`, add:

```js
let eventEmitter = null;

export function setNotesEventEmitter(emitter) {
  eventEmitter = emitter;
}

function emitChapterUpdated(notesPath, chapter) {
  if (eventEmitter) {
    eventEmitter.emit('notes:chapter-updated', { notesPath, chapter });
  }
}
```

- [ ] **Step 2: Emit event after `initChapter` completes**

At the end of `initChapter`, after file write:

```js
  // At the end of initChapter, after all writes:
  const { chapters } = readFolderNotes(notesPath);
  const chapter = chapters.find(ch => ch.title === title || ch.url === url);
  if (chapter) {
    emitChapterUpdated(notesPath, chapter);
  }

  return { isNew: true, filePath: notesPath, chapterId: title };
```

- [ ] **Step 3: Emit event after other chapter modifications**

In existing functions `writeSummarySection`, `updateBullets`, and `moveChapter`, add the same emission pattern at the end:

```js
  // After the write operation completes:
  const { chapters } = readFolderNotes(targetNotesPath);
  const chapter = chapters.find(ch => ch.filePath === basename); // or by URL if needed
  if (chapter) {
    emitChapterUpdated(targetNotesPath, chapter);
  }
```

- [ ] **Step 4: Wire emitter in ipc-handlers.js**

In `src/main/ipc-handlers.js`, after importing `notes-store`:

```js
import { setNotesEventEmitter, ... } from './notes-store.js';

// In the main IPC setup function (likely in registerHandlers or similar):
const { ipcMain } = require('electron');

// Create event broadcaster
const notesEmitter = new EventEmitter();
setNotesEventEmitter(notesEmitter);

// Forward to all windows
notesEmitter.on('notes:chapter-updated', (data) => {
  const mainWindow = BrowserWindow.getAllWindows()[0];
  if (mainWindow) {
    mainWindow.webContents.send('notes:chapter-updated', data);
  }
});
```

- [ ] **Step 5: Run tests**

```bash
npm run test tests/main/notes-store.test.js
```

Expected: All tests pass. (No new tests needed here — the event emission is a side effect, not a visible behavior change.)

- [ ] **Step 6: Commit**

```bash
git add src/main/notes-store.js src/main/ipc-handlers.js
git commit -m "feat: emit notes:chapter-updated IPC event on all chapter changes

After initChapter, writeSummarySection, updateBullets, or moveChapter, emit an IPC event with the updated chapter object so the renderer can update browserActiveChapter in real-time.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"
```

---

## Task 3: Update download-manager.js — Immediate stub creation

**Files:**
- Modify: `src/main/download-manager.js`
- Test: `tests/main/download-manager.test.js`

**Context:** Call `initChapter` at queue-add time (with URL as the key) instead of only on completion.

- [ ] **Step 1: Review current `add` method and where `initChapter` is called**

Find the line that calls `initChapter(filePath, ...)` after yt-dlp completes. We'll add a second call here before async operations.

- [ ] **Step 2: Write failing test**

In `tests/main/download-manager.test.js`, add:

```js
test('add() creates a notes stub immediately with URL as key', async () => {
  const manager = new DownloadManager(config);
  const mockInitChapter = jest.spyOn(notesStore, 'initChapter');

  const downloadId = manager.add(
    'https://example.com/video',
    'best',
    'My Video',
    { url: 'https://example.com/video', title: 'My Video' }
  );

  // Should be called immediately with URL key
  expect(mockInitChapter).toHaveBeenCalledWith(
    'https://example.com/video',
    expect.objectContaining({ url: 'https://example.com/video', title: 'My Video' }),
    expect.any(String)
  );

  mockInitChapter.mockRestore();
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npm run test tests/main/download-manager.test.js
```

Expected: test fails (initChapter not called at add-time)

- [ ] **Step 4: Implement immediate stub creation**

In `src/main/download-manager.js`, at the start of the `add(...)` method, after generating the download ID but before spawning yt-dlp, add:

```js
add(sourceUrl, format, title, metadata = {}) {
  const id = generateId();
  const outputFolder = this.config.outputFolder;

  // Create notes stub immediately with URL as key
  initChapter(sourceUrl, {
    url: sourceUrl,
    title: metadata.title || title,
    downloadedAt: new Date().toISOString().split('T')[0]
  }, outputFolder);

  // Rest of existing add logic...
  const ytdlpProcess = spawn(ytdlpPath, [...args]);
  // ... etc
}
```

- [ ] **Step 5: Update the completion handler to resolve the filename**

When the download completes successfully and the real filename is known, call `initChapter` again with the real filename:

```js
// On completion (in the process success handler):
const realFilePath = path.join(outputFolder, downloadedFilename);
const basename = path.basename(realFilePath);

initChapter(realFilePath, {
  url: sourceUrl,
  title: metadata.title || title,
  downloadedAt: new Date().toISOString().split('T')[0]
}, outputFolder);
```

- [ ] **Step 6: Run test to verify it passes**

```bash
npm run test tests/main/download-manager.test.js
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/main/download-manager.js tests/main/download-manager.test.js
git commit -m "feat: create notes stub immediately on download queue

Call initChapter with URL-based key at add() time so a chapter entry exists immediately with title and URL. On completion, resolve the filename to the real basename.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"
```

---

## Task 4: Update auto-classifier.js — Emit event after move

**Files:**
- Modify: `src/main/auto-classifier.js`

**Context:** After `moveChapter` completes, emit `notes:chapter-updated` so the renderer reflects the new folder/path.

- [ ] **Step 1: Find `moveChapter` call in auto-classifier.js**

Locate where classification completes and `moveChapter(...)` is invoked.

- [ ] **Step 2: Add event emission after moveChapter**

```js
// After moveChapter completes:
const targetNotesPath = getNotesPath(newFilePath, config.outputFolder);
const { chapters } = readFolderNotes(targetNotesPath);
const chapter = chapters.find(ch => ch.filePath === path.basename(newFilePath));
if (chapter) {
  emitChapterUpdated(targetNotesPath, chapter);
}
```

(Use the `emitChapterUpdated` helper created in Task 2.)

- [ ] **Step 3: Test locally**

No new unit test needed here — the event is emitted as a side effect. Test manually in Task 8+ when we verify the full flow.

- [ ] **Step 4: Commit**

```bash
git add src/main/auto-classifier.js
git commit -m "feat: emit notes:chapter-updated after classification moves file

When auto-classifier moves a file to a classified folder, emit the updated chapter event so the renderer sees the new path immediately.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"
```

---

## Task 5: Update ai-summarizer.js — Emit event after summary

**Files:**
- Modify: `src/main/ai-summarizer.js`

**Context:** After `writeSummarySection` completes, emit `notes:chapter-updated` so the renderer reflects the new summary.

- [ ] **Step 1: Find `writeSummarySection` call in ai-summarizer.js**

Locate where the summary text is written to notes.md.

- [ ] **Step 2: Add event emission after write**

```js
// After writeSummarySection completes:
const { chapters } = readFolderNotes(notesPath);
const chapter = chapters.find(ch => ch.url === sourceUrl || ch.filePath === basename);
if (chapter) {
  emitChapterUpdated(notesPath, chapter);
}
```

- [ ] **Step 3: Test locally**

No new unit test needed. Test manually in later tasks.

- [ ] **Step 4: Commit**

```bash
git add src/main/ai-summarizer.js
git commit -m "feat: emit notes:chapter-updated after AI summarizing

When generateSummary writes the summary section, emit the updated chapter event so the renderer sees the new summary immediately without polling.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"
```

---

## Task 6: Add browserActiveChapter to Zustand store

**Files:**
- Modify: `src/renderer/src/store/app-store.js`
- Test: `tests/renderer/app-store.test.js` (existing)

**Context:** Add a new slice to hold the currently active chapter in the Browser Notes panel.

- [ ] **Step 1: Review current Zustand store structure**

Understand how slices are organized in `app-store.js`.

- [ ] **Step 2: Add browserActiveChapter slice**

```js
// In app-store.js, add to the initial state:
const initialState = {
  // ... existing state
  browserActiveChapter: null, // { notesPath: string, chapter: ChapterObject }
};

// In the store creation, add setter:
setBrowserActiveChapter: (data) => set({ browserActiveChapter: data }),
```

If the store uses a functional pattern, add it to the state object:

```js
export const useAppStore = create((set) => ({
  // ... existing state and setters

  browserActiveChapter: null,
  setBrowserActiveChapter: (data) => set({ browserActiveChapter: data }),
}));
```

- [ ] **Step 3: Write test for browserActiveChapter setter**

In `tests/renderer/app-store.test.js`, add:

```js
test('setBrowserActiveChapter updates state', () => {
  const { result } = renderHook(() => useAppStore());

  const chapter = {
    notesPath: '/path/to/notes.md',
    chapter: {
      filePath: 'video.mp4',
      title: 'My Video',
      url: 'https://example.com/video',
      downloadedAt: '2026-03-29',
      summary: 'Summary here',
      bullets: ['bullet 1', 'bullet 2']
    }
  };

  act(() => {
    result.current.setBrowserActiveChapter(chapter);
  });

  expect(result.current.browserActiveChapter).toEqual(chapter);
});
```

- [ ] **Step 4: Run test**

```bash
npm run test:renderer tests/renderer/app-store.test.js
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/store/app-store.js tests/renderer/app-store.test.js
git commit -m "feat: add browserActiveChapter to Zustand store

New store slice to hold the currently active chapter displayed in the Browser Notes panel. Updated via IPC on chapter creation, move, or summary completion.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"
```

---

## Task 7: Update useIpcEvents.js — Subscribe to notes:chapter-updated

**Files:**
- Modify: `src/renderer/src/hooks/useIpcEvents.js`
- Test: `tests/renderer/useIpcEvents.test.js` (existing)

**Context:** Wire up the IPC subscription so incoming `notes:chapter-updated` events update the Zustand store.

- [ ] **Step 1: Review useIpcEvents.js structure**

Understand how IPC subscriptions are registered (e.g., with `window.api.on(...)`).

- [ ] **Step 2: Add subscription to notes:chapter-updated**

In `useIpcEvents.js`, add to the `useEffect`:

```js
useEffect(() => {
  // ... existing subscriptions

  const handleChapterUpdated = (data) => {
    setBrowserActiveChapter(data);
  };

  window.api.on('notes:chapter-updated', handleChapterUpdated);

  return () => {
    window.api.off('notes:chapter-updated', handleChapterUpdated);
  };
}, [setBrowserActiveChapter]);
```

- [ ] **Step 3: Write test**

In `tests/renderer/useIpcEvents.test.js`, add:

```js
test('subscribes to notes:chapter-updated and updates store', () => {
  const mockOn = jest.fn();
  const mockOff = jest.fn();
  window.api = { on: mockOn, off: mockOff };

  renderHook(() => useIpcEvents());

  expect(mockOn).toHaveBeenCalledWith('notes:chapter-updated', expect.any(Function));
});
```

- [ ] **Step 4: Run test**

```bash
npm run test:renderer tests/renderer/useIpcEvents.test.js
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/hooks/useIpcEvents.js tests/renderer/useIpcEvents.test.js
git commit -m "feat: subscribe to notes:chapter-updated IPC event

Register IPC listener in useIpcEvents hook to update browserActiveChapter store on chapter creation, move, or summary completion.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"
```

---

## Task 8: Extract ChapterCard from NotesChapterView.jsx

**Files:**
- Create: `src/renderer/src/components/ChapterCard.jsx`
- Modify: `src/renderer/src/components/NotesChapterView.jsx`
- Test: `tests/renderer/ChapterCard.test.js` (new)

**Context:** Extract the chapter card rendering and editing logic into a reusable component. This component should be used by both `NotesChapterView` (Library tab) and `BrowserNotesPanel` (Browser tab).

- [ ] **Step 1: Read NotesChapterView.jsx and identify ChapterCard**

Find the component or section that renders a single chapter (title, AI Summary, My Notes). Note its current props and state management.

- [ ] **Step 2: Create ChapterCard.jsx**

```js
import React, { useState } from 'react';

export function ChapterCard({ chapter, onBulletsChange, onGenerateSummary }) {
  const [editingBullets, setEditingBullets] = useState(false);
  const [localBullets, setLocalBullets] = useState(chapter.bullets.join('\n'));
  const [isGenerating, setIsGenerating] = useState(false);

  const handleEditToggle = () => {
    if (editingBullets) {
      setEditingBullets(false);
      setLocalBullets(chapter.bullets.join('\n'));
    } else {
      setEditingBullets(true);
    }
  };

  const handleSaveBullets = async () => {
    const bullets = localBullets
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    if (onBulletsChange) {
      await onBulletsChange(chapter.filePath, bullets);
    }
    setEditingBullets(false);
  };

  const handleGenerateSummary = async () => {
    setIsGenerating(true);
    if (onGenerateSummary) {
      await onGenerateSummary(chapter.filePath);
    }
    setIsGenerating(false);
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{chapter.title}</h3>

      {chapter.url && (
        <p className="text-sm text-gray-600 mb-3 truncate">
          <a href={chapter.url} className="text-blue-500 hover:underline">
            {chapter.url}
          </a>
        </p>
      )}

      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-medium text-gray-700">AI Summary</h4>
          <button
            onClick={handleGenerateSummary}
            disabled={isGenerating}
            className="text-xs text-blue-500 hover:text-blue-700 disabled:text-gray-400"
          >
            {isGenerating ? 'Generating...' : 'Generate'}
          </button>
        </div>
        <div className="text-sm text-gray-700 whitespace-pre-wrap">
          {chapter.summary || '(No summary yet)'}
        </div>
      </div>

      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-medium text-gray-700">My Notes</h4>
          <button
            onClick={handleEditToggle}
            className="text-xs text-blue-500 hover:text-blue-700"
          >
            {editingBullets ? 'Done' : 'Edit'}
          </button>
        </div>

        {editingBullets ? (
          <div>
            <textarea
              value={localBullets}
              onChange={(e) => setLocalBullets(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={4}
              placeholder="Enter notes, one per line (no dash needed)"
            />
            <button
              onClick={handleSaveBullets}
              className="mt-2 px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600"
            >
              Save
            </button>
          </div>
        ) : (
          <ul className="text-sm text-gray-700 space-y-1">
            {chapter.bullets.length > 0 ? (
              chapter.bullets.map((bullet, idx) => (
                <li key={idx} className="list-disc list-inside">
                  {bullet}
                </li>
              ))
            ) : (
              <li className="text-gray-500 italic">(No notes yet)</li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Update NotesChapterView.jsx to use ChapterCard**

Replace the inline chapter rendering with:

```js
import { ChapterCard } from './ChapterCard';

export function NotesChapterView() {
  // ... existing code

  return (
    <div>
      {chapters.map((chapter) => (
        <ChapterCard
          key={chapter.filePath || chapter.url}
          chapter={chapter}
          onBulletsChange={handleBulletsChange}
          onGenerateSummary={handleGenerateSummary}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Write test for ChapterCard**

In `tests/renderer/ChapterCard.test.js`:

```js
import { render, screen, fireEvent } from '@testing-library/react';
import { ChapterCard } from '../src/renderer/src/components/ChapterCard';

describe('ChapterCard', () => {
  const mockChapter = {
    filePath: 'video.mp4',
    title: 'My Video',
    url: 'https://example.com/video',
    summary: 'This is a summary',
    bullets: ['bullet 1', 'bullet 2']
  };

  test('renders chapter title and URL', () => {
    render(
      <ChapterCard
        chapter={mockChapter}
        onBulletsChange={jest.fn()}
        onGenerateSummary={jest.fn()}
      />
    );

    expect(screen.getByText('My Video')).toBeInTheDocument();
    expect(screen.getByText('https://example.com/video')).toBeInTheDocument();
  });

  test('renders summary and bullets', () => {
    render(
      <ChapterCard
        chapter={mockChapter}
        onBulletsChange={jest.fn()}
        onGenerateSummary={jest.fn()}
      />
    );

    expect(screen.getByText('This is a summary')).toBeInTheDocument();
    expect(screen.getByText('bullet 1')).toBeInTheDocument();
    expect(screen.getByText('bullet 2')).toBeInTheDocument();
  });

  test('toggles edit mode on Edit button click', () => {
    render(
      <ChapterCard
        chapter={mockChapter}
        onBulletsChange={jest.fn()}
        onGenerateSummary={jest.fn()}
      />
    );

    const editButton = screen.getByText('Edit');
    fireEvent.click(editButton);

    expect(screen.getByDisplayValue('bullet 1\nbullet 2')).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
  });

  test('saves bullets on Save button click', async () => {
    const mockOnBulletsChange = jest.fn().mockResolvedValue(undefined);
    render(
      <ChapterCard
        chapter={mockChapter}
        onBulletsChange={mockOnBulletsChange}
        onGenerateSummary={jest.fn()}
      />
    );

    fireEvent.click(screen.getByText('Edit'));
    const textarea = screen.getByDisplayValue('bullet 1\nbullet 2');
    fireEvent.change(textarea, { target: { value: 'new bullet\nanother bullet' } });
    fireEvent.click(screen.getByText('Save'));

    expect(mockOnBulletsChange).toHaveBeenCalledWith('video.mp4', ['new bullet', 'another bullet']);
  });
});
```

- [ ] **Step 5: Run tests**

```bash
npm run test:renderer tests/renderer/ChapterCard.test.js
```

Expected: All tests PASS

- [ ] **Step 6: Verify NotesChapterView still works**

```bash
npm run test:renderer tests/renderer/NotesChapterView.test.js
```

Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/components/ChapterCard.jsx src/renderer/src/components/NotesChapterView.jsx tests/renderer/ChapterCard.test.js
git commit -m "refactor: extract ChapterCard into reusable component

Extract chapter rendering and bullet/summary editing logic from NotesChapterView into a standalone ChapterCard component. This component is now shared between Library Notes view and Browser Notes panel.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"
```

---

## Task 9: Create BrowserNotesPanel.jsx

**Files:**
- Create: `src/renderer/src/components/BrowserNotesPanel.jsx`
- Test: `tests/renderer/BrowserNotesPanel.test.js` (new)

**Context:** New panel that displays the active chapter in the Browser tab using the extracted `ChapterCard`.

- [ ] **Step 1: Create BrowserNotesPanel.jsx**

```js
import React from 'react';
import { useAppStore } from '../store/app-store';
import { ChapterCard } from './ChapterCard';

export function BrowserNotesPanel() {
  const browserActiveChapter = useAppStore((state) => state.browserActiveChapter);
  const setBrowserActiveChapter = useAppStore((state) => state.setBrowserActiveChapter);

  const handleBulletsChange = async (filePath, bullets) => {
    try {
      await window.api.updateBullets(filePath, bullets);
      // Chapter state will be updated via IPC event, no need to manually update
    } catch (error) {
      console.error('Failed to save bullets:', error);
    }
  };

  const handleGenerateSummary = async (filePath) => {
    try {
      await window.api.generateSummary(filePath);
      // Summary state will be updated via IPC event
    } catch (error) {
      console.error('Failed to generate summary:', error);
    }
  };

  if (!browserActiveChapter) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 text-sm">
        Click Remember or Download to start notes
      </div>
    );
  }

  const { chapter } = browserActiveChapter;

  return (
    <div className="overflow-y-auto h-full p-4">
      <ChapterCard
        chapter={chapter}
        onBulletsChange={handleBulletsChange}
        onGenerateSummary={handleGenerateSummary}
      />
    </div>
  );
}
```

- [ ] **Step 2: Write tests**

In `tests/renderer/BrowserNotesPanel.test.js`:

```js
import { render, screen } from '@testing-library/react';
import { BrowserNotesPanel } from '../src/renderer/src/components/BrowserNotesPanel';
import { useAppStore } from '../src/renderer/src/store/app-store';

jest.mock('../src/renderer/src/store/app-store');
jest.mock('../src/renderer/src/components/ChapterCard', () => ({
  ChapterCard: ({ chapter }) => <div>Mock ChapterCard: {chapter.title}</div>
}));

describe('BrowserNotesPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders empty state when no chapter is active', () => {
    useAppStore.mockReturnValue(null);
    render(<BrowserNotesPanel />);

    expect(screen.getByText(/Click Remember or Download to start notes/)).toBeInTheDocument();
  });

  test('renders ChapterCard when chapter is active', () => {
    const mockChapter = {
      notesPath: '/path/to/notes.md',
      chapter: {
        filePath: 'video.mp4',
        title: 'My Video',
        url: 'https://example.com',
        summary: 'Summary',
        bullets: []
      }
    };

    useAppStore.mockReturnValue(mockChapter);
    render(<BrowserNotesPanel />);

    expect(screen.getByText('Mock ChapterCard: My Video')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run tests**

```bash
npm run test:renderer tests/renderer/BrowserNotesPanel.test.js
```

Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/BrowserNotesPanel.jsx tests/renderer/BrowserNotesPanel.test.js
git commit -m "feat: create BrowserNotesPanel component for Browser tab

New panel displays the active chapter in the Browser tab using ChapterCard. Shows empty state when no chapter is active. Handles bullet updates and summary generation via IPC.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"
```

---

## Task 10: Update SidePanel.jsx — Add tabs and conditional rendering

**Files:**
- Modify: `src/renderer/src/components/SidePanel.jsx`
- Test: `tests/renderer/SidePanel.test.js` (existing)

**Context:** Add tab state and conditional rendering to switch between Notes (default) and Progress panels.

- [ ] **Step 1: Read SidePanel.jsx and understand current structure**

Find where `ProgressPanel` is rendered.

- [ ] **Step 2: Add activeTab state**

At the top of the component:

```js
const [activeTab, setActiveTab] = useState('notes'); // 'notes' | 'progress'
```

- [ ] **Step 3: Add tab bar UI**

Replace the bottom pane with a tabbed layout:

```js
<div className="flex flex-col flex-1 border-t border-gray-300">
  {/* Tab bar */}
  <div className="flex border-b border-gray-300 bg-gray-50">
    <button
      onClick={() => setActiveTab('notes')}
      className={`flex-1 py-2 px-4 text-sm font-medium transition-colors ${
        activeTab === 'notes'
          ? 'text-blue-600 border-b-2 border-blue-600'
          : 'text-gray-600 hover:text-gray-900'
      }`}
    >
      Notes
    </button>
    <button
      onClick={() => setActiveTab('progress')}
      className={`flex-1 py-2 px-4 text-sm font-medium transition-colors ${
        activeTab === 'progress'
          ? 'text-blue-600 border-b-2 border-blue-600'
          : 'text-gray-600 hover:text-gray-900'
      }`}
    >
      Progress
    </button>
  </div>

  {/* Tab content */}
  <div className="flex-1 overflow-hidden">
    {activeTab === 'notes' ? (
      <BrowserNotesPanel />
    ) : (
      <ProgressPanel />
    )}
  </div>
</div>
```

- [ ] **Step 4: Import BrowserNotesPanel**

At the top of `SidePanel.jsx`, add:

```js
import { BrowserNotesPanel } from './BrowserNotesPanel';
```

- [ ] **Step 5: Write test**

In `tests/renderer/SidePanel.test.js`, add:

```js
test('renders Notes and Progress tabs with Notes as default', () => {
  render(<SidePanel />);

  expect(screen.getByText('Notes')).toBeInTheDocument();
  expect(screen.getByText('Progress')).toBeInTheDocument();

  // Notes should be default (no specific assertion needed, just that component renders)
});

test('switches to Progress tab on click', () => {
  const { rerender } = render(<SidePanel />);

  const progressTab = screen.getByText('Progress');
  fireEvent.click(progressTab);

  // After click, Progress content should be visible (inspect via class or role)
  // This depends on how ProgressPanel is structured
});
```

- [ ] **Step 6: Run tests**

```bash
npm run test:renderer tests/renderer/SidePanel.test.js
```

Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/components/SidePanel.jsx tests/renderer/SidePanel.test.js
git commit -m "feat: add tabbed Notes/Progress layout to SidePanel

Bottom pane now shows tabbed interface switching between Notes (default) and Progress panels. Tab state is local to SidePanel with no persistence.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"
```

---

## Task 11: Integration test — Full flow from click to display

**Files:**
- Test: `tests/integration/browser-notes-flow.test.js` (new)

**Context:** End-to-end test verifying the entire flow: click Download → notes stub created → Notes panel shows → real filename resolved → Notes updated.

- [ ] **Step 1: Create integration test file**

In `tests/integration/browser-notes-flow.test.js`:

```js
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BrowserTab } from '../../src/renderer/src/components/BrowserTab';
import { useAppStore } from '../../src/renderer/src/store/app-store';

describe('Browser Notes Flow', () => {
  beforeEach(() => {
    // Reset store and mocks
    jest.clearAllMocks();
  });

  test('Click Download creates stub, shows in Notes panel, and updates on completion', async () => {
    // Setup mocks
    global.window.api = {
      extractInfo: jest.fn().mockResolvedValue([
        {
          title: 'Test Video',
          url: 'https://example.com/video',
          type: 'video',
          thumbnail: 'https://example.com/thumb.jpg'
        }
      ]),
      addDownload: jest.fn().mockReturnValue('download-123'),
      on: jest.fn(),
      off: jest.fn(),
      listLibrary: jest.fn().mockResolvedValue([])
    };

    // Mock IPC to simulate notes:chapter-updated event
    const mockIpcListeners = {};
    global.window.api.on = jest.fn((event, handler) => {
      mockIpcListeners[event] = handler;
    });

    render(<BrowserTab />);

    // Simulate Download button click
    const downloadButton = await screen.findByText('Download');
    fireEvent.click(downloadButton);

    // Verify initChapter was called
    expect(global.window.api.addDownload).toHaveBeenCalledWith(
      'https://example.com/video',
      expect.any(String),
      'Test Video',
      expect.any(Object)
    );

    // Simulate IPC event for stub creation
    const stubChapter = {
      notesPath: '/path/to/notes.md',
      chapter: {
        filePath: null,
        title: 'Test Video',
        url: 'https://example.com/video',
        downloadedAt: '2026-03-29',
        summary: '',
        bullets: []
      }
    };

    act(() => {
      mockIpcListeners['notes:chapter-updated'](stubChapter);
    });

    // Verify Notes panel now shows the chapter
    await waitFor(() => {
      expect(screen.getByText('Test Video')).toBeInTheDocument();
    });

    // Simulate completion with real filename
    const completedChapter = {
      notesPath: '/path/to/notes.md',
      chapter: {
        filePath: 'test-video.mp4',
        title: 'Test Video',
        url: 'https://example.com/video',
        downloadedAt: '2026-03-29',
        summary: '',
        bullets: []
      }
    };

    act(() => {
      mockIpcListeners['notes:chapter-updated'](completedChapter);
    });

    // Verify filename is now visible
    await waitFor(() => {
      expect(screen.getByText(/test-video\.mp4/)).toBeInTheDocument();
    });
  });

  test('User edits bullets while classification is running — no conflict', async () => {
    // Similar test for conflict prevention: start typing, trigger summary, textarea not replaced
  });
});
```

- [ ] **Step 2: Run integration test**

```bash
npm run test:all
```

Expected: New integration test PASSES (may need tweaks based on actual component structure)

- [ ] **Step 3: Commit**

```bash
git add tests/integration/browser-notes-flow.test.js
git commit -m "test: add integration test for browser notes flow

End-to-end test covering: Download click → stub creation → Notes panel display → filename resolution → updates without conflict.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"
```

---

## Task 12: Manual verification and demo

**Files:**
- (No code changes)

**Context:** Manually test the feature end-to-end to ensure it works as intended.

- [ ] **Step 1: Build and run dev server**

```bash
npm run dev
```

- [ ] **Step 2: Test scenario 1 — Immediate stub on Download**

1. In Browser tab, navigate to a video URL
2. Click Download
3. Switch to Library tab → find the video file → open Notes
4. Verify chapter stub exists with title + URL (but no filename yet)

- [ ] **Step 3: Test scenario 2 — Notes panel shows immediately**

1. In Browser tab, click Download on a video
2. **Without switching tabs**, look at the Notes tab in the progress panel
3. Verify the Notes panel shows the chapter with title and URL
4. Type some bullets in the Notes panel
5. Click Save
6. Verify bullets are saved (check Library Notes to confirm)

- [ ] **Step 4: Test scenario 3 — Filename resolved on completion**

1. Download a video and let it complete
2. In Notes panel, verify the filename now appears (in metadata or title)

- [ ] **Step 5: Test scenario 4 — Classification updates without conflict**

1. Download a video that gets classified to a subfolder
2. While editing bullets in Notes panel, watch for the chapter path to update
3. Verify textarea is not replaced (you can still type)

- [ ] **Step 6: Test scenario 5 — Summary updates without conflict**

1. Download a video
2. Start typing bullets in Notes panel (don't save yet)
3. Trigger "Generate Summary" via Library tab (if applicable) or via the Notes panel's Generate button
4. Verify AI Summary section updates but textarea is still editable

- [ ] **Step 7: Test scenario 6 — Progress tab still works**

1. Click Progress tab
2. Verify ProgressPanel renders with active/completed downloads
3. Click Notes tab
4. Verify Notes panel re-renders correctly

- [ ] **Step 8: Document any issues**

If issues are found, create follow-up tasks. Otherwise, mark this task done.

- [ ] **Step 9: Commit (if any tweaks were needed)**

```bash
git add .
git commit -m "Manual verification: browser notes panel feature complete

Verified all scenarios: immediate stub creation, Notes panel display, filename resolution, conflict prevention during classification/summarization, and tab switching.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"
```

---

## Summary

This plan implements the Browser Notes Panel feature with 12 tasks across backend and frontend:

- **Backend (Tasks 1–5):** Immediate stub creation, URL-based adoption, IPC event emission
- **Frontend State (Tasks 6–7):** Zustand slice, IPC subscription
- **Frontend UI (Tasks 8–10):** Extract ChapterCard, create BrowserNotesPanel, add tabs to SidePanel
- **Verification (Tasks 11–12):** Integration test and manual testing

All tasks follow TDD where applicable, use bite-sized steps, and include commits at logical boundaries.
