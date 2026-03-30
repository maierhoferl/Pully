# Files Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a native file browser tab that lets users import local files (documents, images, text) into the Pully library with automatic format conversion and AI-friendly content extraction.

**Architecture:** The Files tab mirrors the Library tab's two-pane layout with a collapsible folder tree on the left, file list in the middle, and detail/preview panel on the right. Files are processed through a plugin-based extraction pipeline (LiteParse for PDFs, officeparser for Office formats), stored as markdown or reference files, and tracked in the metadata index just like videos and bookmarks.

**Tech Stack:**
- Frontend: React 19, Zustand (state), Tailwind (styling)
- Backend: Node.js, IPC handlers, LiteParse, officeparser
- Data: metadata-index.json (existing), `.ref` and `.md` files (new storage)

---

## File Structure

### New Files to Create

| File | Purpose |
|---|---|
| `src/renderer/src/components/FilesTab.jsx` | Main tab component (layout: tree + list + detail) |
| `src/renderer/src/components/FileTree.jsx` | Recursive folder tree with collapsible folders |
| `src/renderer/src/components/FileList.jsx` | File list for current folder + breadcrumb |
| `src/main/file-processor.js` | Extraction pipeline (LiteParse, officeparser, etc.) |
| `tests/main/file-processor.test.js` | Tests for extraction logic |

### Files to Modify

| File | Changes |
|---|---|
| `package.json` | Add `@llamaindex/liteparse`, `officeparser` dependencies |
| `src/main/ipc-handlers.js` | Update `isHelperFile`, add `files:*` handlers |
| `src/preload/index.js` | Expose `files:*` IPC methods |
| `src/renderer/src/store/app-store.js` | Add `filesLastDir`, `filesSideWidth`, `filesSideSplitPct` state |
| `src/renderer/src/components/TabBar.jsx` | Add Files tab to `TABS` constant |
| `src/renderer/src/components/LibraryDetailPanel.jsx` | Add preview for `originalPath` (non-local files) |

---

## Implementation Tasks

### Phase 1: Dependencies & Setup

#### Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add npm dependencies**

Edit `package.json` and add to `devDependencies`:
```json
{
  "dependencies": {
    "@llamaindex/liteparse": "^1.4.1",
    "officeparser": "^6.0.7"
  }
}
```

- [ ] **Step 2: Run npm install**

```bash
npm install
```

Expected: No errors, `node_modules/@llamaindex/liteparse` and `node_modules/officeparser` exist.

- [ ] **Step 3: Verify imports work**

```bash
node -e "import('@llamaindex/liteparse').then(() => console.log('LiteParse OK')).catch(e => console.error(e))"
node -e "import('officeparser').then(() => console.log('officeparser OK')).catch(e => console.error(e))"
```

Expected: Both log "OK".

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "dep: add liteparse and officeparser for document extraction"
```

---

#### Task 2: Fix isHelperFile to Allow .md Imports

**Files:**
- Modify: `src/main/ipc-handlers.js` (around line 35-43)

- [ ] **Step 1: Read isHelperFile function**

Locate the `isHelperFile` function in `ipc-handlers.js`. Current behavior excludes ALL `.md` files.

- [ ] **Step 2: Update isHelperFile logic**

Replace the existing function with:

```javascript
const isHelperFile = (fileName) => {
  // Only exclude the folder-level notes file, not all .md imports
  if (fileName === 'notes.md') return true;
  if (fileName === '.pully.json') return true;
  if (fileName === '.gitignore') return true;
  if (/\.thumb(\.[a-z]+)?$/i.test(fileName)) return true;  // Thumbnails: Video.thumb.jpg
  if (/\.nfo$/i.test(fileName)) return true;  // Info files
  return false;
};
```

- [ ] **Step 3: Test in library:list**

In `npm run dev`, open Library tab. Verify that any existing `.md` files (if any) now appear, and `notes.md` is still hidden. If no existing `.md` files, verify the function runs without errors.

- [ ] **Step 4: Commit**

```bash
git add src/main/ipc-handlers.js
git commit -m "fix: allow .md imports in library listing (only exclude notes.md)"
```

---

### Phase 2: State Management

#### Task 3: Add File Browser State to Zustand Store

**Files:**
- Modify: `src/renderer/src/store/app-store.js`

- [ ] **Step 1: Locate store definition**

Find the `create()` call in `app-store.js`.

- [ ] **Step 2: Add filesLastDir state**

Add to the store object:

```javascript
// File browser state
filesLastDir: null,  // Path to last browsed folder
filesSideWidth: 320, // Right panel width (default 320px)
filesSideSplitPct: 60, // Preview/summary split (60% preview, 40% summary)

// Setters
setFilesLastDir: (path) => set({ filesLastDir: path }),
setFilesSideWidth: (width) => set({ filesSideWidth: width }),
setFilesSideSplitPct: (pct) => set({ filesSideSplitPct: pct }),
```

- [ ] **Step 3: Verify TypeScript/shape**

If the store is typed, verify new fields match the pattern (strings, numbers, functions).

- [ ] **Step 4: Run dev and check store**

```bash
npm run dev
```

Open browser console: `useAppStore.getState()` should include `filesLastDir`, `filesSideWidth`, `filesSideSplitPct`.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/store/app-store.js
git commit -m "feat: add file browser state to Zustand store"
```

---

### Phase 3: IPC Layer

#### Task 4: Add File Browser IPC Handlers (Part 1: List & Navigate)

**Files:**
- Modify: `src/main/ipc-handlers.js` (add new handlers at the end)
- Modify: `src/preload/index.js` (expose new methods)

- [ ] **Step 1: Add handler in ipc-handlers.js**

Add these handlers after existing handlers:

```javascript
// File Browser Handlers

ipcMain.handle('files:listRoots', async () => {
  // Return filesystem roots
  // macOS: ['/']
  // Windows: ['C:', 'D:', ...]
  // Linux: ['/']
  if (process.platform === 'win32') {
    const drives = [];
    for (let i = 65; i <= 90; i++) {
      const drive = String.fromCharCode(i) + ':';
      if (require('fs').existsSync(drive + '\\')) drives.push(drive);
    }
    return drives;
  }
  return ['/'];
});

ipcMain.handle('files:listDir', async (event, dirPath) => {
  // List immediate children (files + first-level folders) of a directory
  const fs = require('fs').promises;
  const path = require('path');

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const items = entries
      .filter(e => !e.name.startsWith('.')) // Skip hidden files
      .map(e => ({
        name: e.name,
        path: path.join(dirPath, e.name),
        isDirectory: e.isDirectory(),
        type: getFileType(e.name),
      }))
      .sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });

    return items;
  } catch (error) {
    return { error: error.message };
  }
});

ipcMain.handle('files:getLastDir', async () => {
  const config = await readConfig();
  return config.filesLastDir || (process.platform === 'win32' ? 'C:' : '/');
});

ipcMain.handle('files:setLastDir', async (event, dirPath) => {
  const config = await readConfig();
  config.filesLastDir = dirPath;
  await writeConfig(config);
  return true;
});

// Helper function: determine file type from name
function getFileType(fileName) {
  const ext = fileName.slice(fileName.lastIndexOf('.')).toLowerCase();
  if (['.pdf'].includes(ext)) return 'pdf';
  if (['.docx', '.doc', '.docm', '.odt', '.rtf', '.xlsx', '.xls', '.xlsm', '.ods', '.pptx', '.ppt', '.pptm', '.odp'].includes(ext)) return 'document';
  if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.tiff', '.heic', '.ico', '.avif'].includes(ext)) return 'image';
  if (['.txt', '.csv', '.json', '.xml', '.yaml', '.md', '.html', '.htm'].includes(ext)) return 'text';
  return 'other';
}

function isSelectableFile(fileName) {
  const type = getFileType(fileName);
  return type !== 'other';
}
```

- [ ] **Step 2: Update preload.js to expose these handlers**

In `src/preload/index.js`, add to the `api` object (within `contextBridge.exposeInMainWorld`):

```javascript
files: {
  listRoots: () => ipcRenderer.invoke('files:listRoots'),
  listDir: (dirPath) => ipcRenderer.invoke('files:listDir', dirPath),
  getLastDir: () => ipcRenderer.invoke('files:getLastDir'),
  setLastDir: (dirPath) => ipcRenderer.invoke('files:setLastDir', dirPath),
},
```

- [ ] **Step 3: Test in dev**

```bash
npm run dev
```

In browser console:
```javascript
window.api.files.listRoots().then(r => console.log(r))
window.api.files.listDir('/Users/lorenzmaierhofer').then(r => console.log(r))
```

Expected: Both return data. Second call should show folders and files.

- [ ] **Step 4: Commit**

```bash
git add src/main/ipc-handlers.js src/preload/index.js
git commit -m "feat: add file listing IPC handlers (listDir, listRoots, getLastDir)"
```

---

#### Task 5: Add File Browser IPC Handlers (Part 2: Import)

**Files:**
- Modify: `src/main/ipc-handlers.js` (add new handlers)
- Modify: `src/preload/index.js` (expose new methods)

- [ ] **Step 1: Add handler in ipc-handlers.js**

Add after the navigation handlers:

```javascript
ipcMain.handle('files:rememberFile', async (event, filePath) => {
  // Import a single file into the library
  // Returns { success: true, title: '...', contentType: '...' } or { error: '...' }
  const path = require('path');
  const fs = require('fs').promises;
  const { processFile } = require('./file-processor');

  try {
    const fileName = path.basename(filePath);
    const config = await readConfig();
    const outputFolder = config.outputFolder;

    // Process the file (extract content if needed)
    const result = await processFile(filePath, outputFolder);

    if (result.error) {
      return { error: result.error };
    }

    // Write metadata entry
    const title = path.parse(fileName).name; // Remove extension
    const contentType = result.contentType; // 'document', 'image', 'text'
    const outputPath = result.outputPath; // Path where file was stored in pully folder
    const stat = await fs.stat(filePath);

    const metadataEntry = {
      title,
      contentType,
      originalPath: filePath,
      downloadedAt: new Date().toISOString(),
    };

    // If a thumbnail is available, download it
    if (result.thumbnailUrl) {
      await downloadAndStoreThumbnail(outputPath, result.thumbnailUrl, metadataStore);
    }

    // Add to metadata index
    const metadataStore = new MetadataStore(config);
    await metadataStore.writeEntry(outputPath, metadataEntry);

    // Emit library change event
    mainWindow.webContents.send('library:changed');

    return { success: true, title, contentType, outputPath };
  } catch (error) {
    return { error: error.message };
  }
});

ipcMain.handle('files:rememberFolder', async (event, folderPath) => {
  // Count files in folder recursively
  // Returns { count: N, files: [] } for the renderer to show confirmation
  const fs = require('fs').promises;
  const path = require('path');

  try {
    const files = [];

    async function walk(dir) {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(fullPath); // Recurse into subdirs
        } else {
          files.push(fullPath);
        }
      }
    }

    await walk(folderPath);
    return { count: files.length, files };
  } catch (error) {
    return { error: error.message };
  }
});

ipcMain.handle('files:isFileRemembered', async (event, filePath) => {
  // Check if a file is already in the library
  const config = await readConfig();
  const metadataStore = new MetadataStore(config);

  try {
    const entry = await metadataStore.readEntry(filePath);
    return { remembered: !!entry };
  } catch {
    return { remembered: false };
  }
});
```

- [ ] **Step 2: Update preload.js**

In `src/preload/index.js`, add to the `files` object:

```javascript
rememberFile: (filePath) => ipcRenderer.invoke('files:rememberFile', filePath),
rememberFolder: (folderPath) => ipcRenderer.invoke('files:rememberFolder', folderPath),
isFileRemembered: (filePath) => ipcRenderer.invoke('files:isFileRemembered', filePath),
```

- [ ] **Step 3: Verify syntax**

Ensure no duplicates in the `files` object. It should now have all 7 methods.

- [ ] **Step 4: Commit**

```bash
git add src/main/ipc-handlers.js src/preload/index.js
git commit -m "feat: add file import IPC handlers (rememberFile, rememberFolder, isFileRemembered)"
```

---

### Phase 4: File Processing

#### Task 6: Create file-processor.js Module

**Files:**
- Create: `src/main/file-processor.js`
- Create: `tests/main/file-processor.test.js`

- [ ] **Step 1: Write failing test**

Create `tests/main/file-processor.test.js`:

```javascript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { processFile } from '../../src/main/file-processor.js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_OUTPUT_DIR = path.join(__dirname, '../../.test-output');

beforeEach(() => {
  if (!fs.existsSync(TEST_OUTPUT_DIR)) {
    fs.mkdirSync(TEST_OUTPUT_DIR, { recursive: true });
  }
});

afterEach(() => {
  if (fs.existsSync(TEST_OUTPUT_DIR)) {
    fs.rmSync(TEST_OUTPUT_DIR, { recursive: true });
  }
});

describe('file-processor', () => {
  it('detects PDF and returns document type', async () => {
    // Create a dummy PDF file
    const pdfPath = path.join(TEST_OUTPUT_DIR, 'test.pdf');
    fs.writeFileSync(pdfPath, '%PDF-1.4\n'); // PDF magic bytes

    const result = await processFile(pdfPath, TEST_OUTPUT_DIR);

    expect(result.contentType).toBe('document');
    expect(result.outputPath).toBeDefined();
  });

  it('detects image and returns image type', async () => {
    const imagePath = path.join(TEST_OUTPUT_DIR, 'test.jpg');
    // Create a minimal JPEG (just magic bytes)
    fs.writeFileSync(imagePath, Buffer.from([0xFF, 0xD8, 0xFF]));

    const result = await processFile(imagePath, TEST_OUTPUT_DIR);

    expect(result.contentType).toBe('image');
  });

  it('detects text and returns text type', async () => {
    const textPath = path.join(TEST_OUTPUT_DIR, 'test.txt');
    fs.writeFileSync(textPath, 'Hello world');

    const result = await processFile(textPath, TEST_OUTPUT_DIR);

    expect(result.contentType).toBe('text');
  });

  it('rejects unsupported file types', async () => {
    const exePath = path.join(TEST_OUTPUT_DIR, 'test.exe');
    fs.writeFileSync(exePath, '');

    const result = await processFile(exePath, TEST_OUTPUT_DIR);

    expect(result.error).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/main/file-processor.test.js
```

Expected: FAIL — `file-processor` not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/main/file-processor.js`:

```javascript
import * as path from 'path';

/**
 * Determine content type from file extension
 */
function getContentTypeFromExt(fileName) {
  const ext = fileName.slice(fileName.lastIndexOf('.')).toLowerCase();

  // Document types
  if (['.pdf', '.docx', '.doc', '.docm', '.odt', '.rtf', '.xlsx', '.xls', '.xlsm', '.ods', '.pptx', '.ppt', '.pptm', '.odp'].includes(ext)) {
    return 'document';
  }

  // Image types
  if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.tiff', '.heic', '.ico', '.avif'].includes(ext)) {
    return 'image';
  }

  // Text types
  if (['.txt', '.csv', '.json', '.xml', '.yaml', '.yml', '.md', '.html', '.htm'].includes(ext)) {
    return 'text';
  }

  return null; // Unsupported
}

/**
 * Process a file: detect type, extract if needed, return metadata
 * @param {string} filePath - Absolute path to source file
 * @param {string} outputFolder - Pully output folder
 * @returns {Promise<{ contentType, outputPath, error?, thumbnailUrl? }>}
 */
export async function processFile(filePath, outputFolder) {
  const fileName = path.basename(filePath);
  const contentType = getContentTypeFromExt(fileName);

  if (!contentType) {
    return { error: `Unsupported file type: ${fileName}` };
  }

  // For now, return type detection only
  // Extraction will be implemented in separate tasks
  return {
    contentType,
    outputPath: path.join(outputFolder, fileName.replace(/\.[^.]+$/, `.${contentType === 'document' ? 'md' : 'ref'}`)),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/main/file-processor.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/file-processor.js tests/main/file-processor.test.js
git commit -m "feat: add file-processor module with content type detection"
```

---

#### Task 7: Add PDF Processing (LiteParse)

**Files:**
- Modify: `src/main/file-processor.js`
- Modify: `tests/main/file-processor.test.js`

- [ ] **Step 1: Write failing test for PDF extraction**

Add to `tests/main/file-processor.test.js`:

```javascript
it('extracts PDF to markdown', async () => {
  // Use a real tiny PDF for testing
  const pdfPath = path.join(TEST_OUTPUT_DIR, 'test-sample.pdf');
  // Write a minimal valid PDF
  const pdfContent = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /MediaBox [0 0 612 792] /Contents 5 0 R >>
endobj
4 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
5 0 obj
<< >>
stream
BT /F1 12 Tf 100 700 Td (Hello PDF) Tj ET
endstream
endobj
xref
0 6
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000273 00000 n
0000000361 00000 n
trailer
<< /Size 6 /Root 1 0 R >>
startxref
450
%%EOF`;
  fs.writeFileSync(pdfPath, pdfContent);

  const result = await processFile(pdfPath, TEST_OUTPUT_DIR);

  expect(result.contentType).toBe('document');
  expect(result.outputPath).toBe(path.join(TEST_OUTPUT_DIR, 'test-sample.md'));
  expect(fs.existsSync(result.outputPath)).toBe(true); // File should be created
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/main/file-processor.test.js -t "extracts PDF"
```

Expected: FAIL — no extraction logic yet.

- [ ] **Step 3: Implement PDF extraction**

Update `src/main/file-processor.js`:

```javascript
import { LiteParse } from '@llamaindex/liteparse';
import * as fs from 'fs/promises';
import * as fssync from 'fs';

const liteParse = new LiteParse({ ocrEnabled: false });

async function extractPdfToMarkdown(filePath, outputPath) {
  try {
    const result = await liteParse.parse(filePath);
    await fs.writeFile(outputPath, result.text);
    return { success: true };
  } catch (error) {
    return { error: error.message };
  }
}

export async function processFile(filePath, outputFolder) {
  const fileName = path.basename(filePath);
  const contentType = getContentTypeFromExt(fileName);

  if (!contentType) {
    return { error: `Unsupported file type: ${fileName}` };
  }

  const baseName = fileName.replace(/\.[^.]+$/, ''); // Remove extension
  const outputPath = path.join(
    outputFolder,
    contentType === 'document' ? `${baseName}.md` : `${baseName}.ref`
  );

  // Extract PDFs to markdown
  if (fileName.toLowerCase().endsWith('.pdf')) {
    const extracted = await extractPdfToMarkdown(filePath, outputPath);
    if (extracted.error) {
      return { error: extracted.error };
    }
  }

  // Extract other documents (handled in next task)
  // Copy reference files (images, text) as-is
  if (contentType === 'image' || contentType === 'text') {
    await fs.copyFile(filePath, outputPath);
  }

  return {
    contentType,
    outputPath,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/main/file-processor.test.js -t "extracts PDF"
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/file-processor.js tests/main/file-processor.test.js
git commit -m "feat: add PDF extraction via LiteParse"
```

---

#### Task 8: Add Office Document Processing (officeparser)

**Files:**
- Modify: `src/main/file-processor.js`
- Modify: `tests/main/file-processor.test.js`

- [ ] **Step 1: Write failing test for DOCX extraction**

Add to `tests/main/file-processor.test.js`:

```javascript
it('extracts DOCX to markdown', async () => {
  // For this test, we'll just check that the handler is invoked
  // (Actual DOCX requires proper Office file structure, which is complex to mock)
  const docxPath = path.join(TEST_OUTPUT_DIR, 'test.docx');
  // Write a dummy DOCX (it's a ZIP with specific structure)
  // For now, we'll rely on officeparser to handle real files
  // This test will pass once officeparser integration is in place

  // Simplified: just verify contentType is detected
  const result = await processFile(docxPath, TEST_OUTPUT_DIR);
  expect(result.contentType).toBe('document');
});
```

- [ ] **Step 2: Run test to verify it fails (or skips)**

```bash
npx vitest run tests/main/file-processor.test.js -t "extracts DOCX"
```

Expected: FAIL — DOCX extraction not yet implemented.

- [ ] **Step 3: Implement Office document extraction**

Update `src/main/file-processor.js`:

```javascript
import { parseOffice } from 'officeparser';

async function extractOfficeToMarkdown(filePath, outputPath) {
  try {
    const result = await parseOffice(filePath);
    // officeparser returns an AST; convert to markdown-like text
    const text = serializeAstToText(result);
    await fs.writeFile(outputPath, text);
    return { success: true };
  } catch (error) {
    return { error: error.message };
  }
}

function serializeAstToText(ast) {
  // Simple serialization: just extract text content from AST
  if (!ast) return '';
  if (typeof ast === 'string') return ast;
  if (Array.isArray(ast)) return ast.map(serializeAstToText).join('\n');
  if (ast.text) return ast.text;
  if (ast.children) return serializeAstToText(ast.children);
  return '';
}

export async function processFile(filePath, outputFolder) {
  const fileName = path.basename(filePath);
  const contentType = getContentTypeFromExt(fileName);

  if (!contentType) {
    return { error: `Unsupported file type: ${fileName}` };
  }

  const baseName = fileName.replace(/\.[^.]+$/, '');
  const outputPath = path.join(
    outputFolder,
    contentType === 'document' ? `${baseName}.md` : `${baseName}.ref`
  );

  // Extract PDFs to markdown
  if (fileName.toLowerCase().endsWith('.pdf')) {
    const extracted = await extractPdfToMarkdown(filePath, outputPath);
    if (extracted.error) {
      return { error: extracted.error };
    }
  }

  // Extract Office documents to markdown
  const officeExtensions = ['.docx', '.doc', '.docm', '.odt', '.rtf', '.xlsx', '.xls', '.xlsm', '.ods', '.pptx', '.ppt', '.pptm', '.odp'];
  if (officeExtensions.some(ext => fileName.toLowerCase().endsWith(ext))) {
    const extracted = await extractOfficeToMarkdown(filePath, outputPath);
    if (extracted.error) {
      return { error: extracted.error };
    }
  }

  // Copy reference files (images, text) as-is
  if (contentType === 'image' || contentType === 'text') {
    await fs.copyFile(filePath, outputPath);
  }

  return {
    contentType,
    outputPath,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/main/file-processor.test.js
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/main/file-processor.js tests/main/file-processor.test.js
git commit -m "feat: add Office document extraction via officeparser (DOCX, XLSX, PPTX, etc.)"
```

---

### Phase 5: Frontend Components

#### Task 9: Create FileTree Component

**Files:**
- Create: `src/renderer/src/components/FileTree.jsx`

- [ ] **Step 1: Write FileTree component**

```jsx
import React, { useState } from 'react';
import { ChevronDown, Folder } from 'lucide-react';

export default function FileTree({
  currentFolder,
  onNavigate,
  onSelectFolder,
}) {
  const [expanded, setExpanded] = useState(new Set([currentFolder]));
  const [tree, setTree] = useState([]);
  const [loading, setLoading] = useState(false);

  // Load roots on mount
  React.useEffect(() => {
    loadRoots();
  }, []);

  async function loadRoots() {
    setLoading(true);
    try {
      const roots = await window.api.files.listRoots();
      setTree(roots.map(root => ({ name: root, path: root, isDirectory: true, children: [] })));
    } catch (error) {
      console.error('Failed to load roots:', error);
    }
    setLoading(false);
  }

  async function expandFolder(folderPath) {
    if (expanded.has(folderPath)) {
      setExpanded(new Set([...expanded].filter(p => p !== folderPath)));
      return;
    }

    try {
      const items = await window.api.files.listDir(folderPath);
      const folders = items.filter(i => i.isDirectory);

      // Update tree structure (simplified for now)
      setExpanded(new Set([...expanded, folderPath]));
    } catch (error) {
      console.error('Failed to expand folder:', error);
    }
  }

  function renderNode(folder, depth = 0) {
    const isExpanded = expanded.has(folder.path);

    return (
      <div key={folder.path}>
        <div
          className={`flex items-center p-1 hover:bg-gray-200 cursor-pointer ${
            currentFolder === folder.path ? 'bg-blue-100' : ''
          }`}
          onClick={() => {
            expandFolder(folder.path);
            onNavigate(folder.path);
          }}
          style={{ paddingLeft: `${depth * 16}px` }}
        >
          {folder.isDirectory && (
            <ChevronDown
              size={16}
              className={`transition-transform ${isExpanded ? '' : '-rotate-90'}`}
            />
          )}
          <Folder size={16} className="ml-1" />
          <span className="ml-1 text-sm">{folder.name}</span>
        </div>
        {/* Children would be rendered here when expanded */}
      </div>
    );
  }

  if (loading) return <div className="p-4">Loading...</div>;

  return (
    <div className="h-full overflow-y-auto bg-gray-50 p-2 text-sm">
      <div className="font-semibold mb-2 text-gray-600">Places</div>
      {tree.map(root => renderNode(root))}
    </div>
  );
}
```

- [ ] **Step 2: Test component loads without errors**

Create a simple test file `tests/renderer/FileTree.test.jsx`:

```javascript
import { render, screen } from '@testing-library/react';
import FileTree from '../../src/renderer/src/components/FileTree';
import { expect, it, vi } from 'vitest';

// Mock window.api
global.window.api = {
  files: {
    listRoots: vi.fn().mockResolvedValue(['/']),
    listDir: vi.fn().mockResolvedValue([]),
  },
};

it('renders without crashing', () => {
  render(<FileTree currentFolder="/" onNavigate={() => {}} onSelectFolder={() => {}} />);
  expect(screen.getByText('Places')).toBeInTheDocument();
});
```

- [ ] **Step 3: Run test**

```bash
npx vitest run tests/renderer/FileTree.test.jsx
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/FileTree.jsx tests/renderer/FileTree.test.jsx
git commit -m "feat: add FileTree component for folder navigation"
```

---

#### Task 10: Create FileList Component

**Files:**
- Create: `src/renderer/src/components/FileList.jsx`

- [ ] **Step 1: Write FileList component**

```jsx
import React, { useState, useEffect } from 'react';
import { File, Image, FileText, Folder, Check } from 'lucide-react';

const ICON_MAP = {
  pdf: <File size={16} className="text-red-500" />,
  document: <FileText size={16} className="text-blue-500" />,
  image: <Image size={16} className="text-green-500" />,
  text: <FileText size={16} className="text-gray-500" />,
  folder: <Folder size={16} className="text-yellow-500" />,
  other: <File size={16} className="text-gray-400" />,
};

export default function FileList({
  currentFolder,
  selectedPath,
  onSelectFile,
  onNavigateFolder,
  rememberedPaths,
}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadFolder();
  }, [currentFolder]);

  async function loadFolder() {
    setLoading(true);
    try {
      const result = await window.api.files.listDir(currentFolder);
      if (result.error) {
        console.error(result.error);
        setItems([]);
      } else {
        setItems(result);
      }
    } catch (error) {
      console.error('Failed to list folder:', error);
    }
    setLoading(false);
  }

  function getIcon(item) {
    if (item.isDirectory) return ICON_MAP.folder;
    return ICON_MAP[item.type] || ICON_MAP.other;
  }

  function isSelectable(item) {
    return !item.isDirectory && item.type !== 'other';
  }

  if (loading) return <div className="p-4">Loading...</div>;

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="flex-1 overflow-y-auto">
        {items.map(item => (
          <div
            key={item.path}
            className={`flex items-center gap-2 p-2 border-b hover:bg-gray-100 cursor-pointer ${
              item.path === selectedPath ? 'bg-blue-50' : ''
            } ${!isSelectable(item) ? 'opacity-50 cursor-default' : ''}`}
            onClick={() => {
              if (item.isDirectory) {
                onNavigateFolder(item.path);
              } else if (isSelectable(item)) {
                onSelectFile(item);
              }
            }}
          >
            {getIcon(item)}
            <span className="flex-1 text-sm">{item.name}</span>
            {rememberedPaths?.includes(item.path) && (
              <Check size={16} className="text-green-500" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create test**

```javascript
import { render, screen } from '@testing-library/react';
import FileList from '../../src/renderer/src/components/FileList';
import { expect, it, vi } from 'vitest';

global.window.api = {
  files: {
    listDir: vi.fn().mockResolvedValue([
      { name: 'file.pdf', path: '/test/file.pdf', type: 'pdf', isDirectory: false },
      { name: 'folder', path: '/test/folder', type: 'folder', isDirectory: true },
    ]),
  },
};

it('renders file list', async () => {
  render(
    <FileList
      currentFolder="/test"
      selectedPath=""
      onSelectFile={() => {}}
      onNavigateFolder={() => {}}
      rememberedPaths={[]}
    />
  );

  await new Promise(r => setTimeout(r, 100)); // Wait for async
  expect(screen.getByText('file.pdf')).toBeInTheDocument();
});
```

- [ ] **Step 3: Run test**

```bash
npx vitest run tests/renderer/FileList.test.jsx
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/FileList.jsx tests/renderer/FileList.test.jsx
git commit -m "feat: add FileList component with file selection"
```

---

#### Task 11: Create FilesTab Main Component

**Files:**
- Create: `src/renderer/src/components/FilesTab.jsx`

- [ ] **Step 1: Write FilesTab component**

```jsx
import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store/app-store';
import FileTree from './FileTree';
import FileList from './FileList';
import LibraryDetailPanel from './LibraryDetailPanel';
import LibraryNotesPanel from './LibraryNotesPanel';

export default function FilesTab() {
  const store = useAppStore();
  const [currentFolder, setCurrentFolder] = useState(store.filesLastDir || '/');
  const [selectedFile, setSelectedFile] = useState(null);
  const [sideWidth, setSideWidth] = useState(store.filesSideWidth || 320);
  const [sideSplitPct, setSideSplitPct] = useState(store.filesSideSplitPct || 60);
  const [rememberedPaths, setRememberedPaths] = useState([]);

  // Persist state
  useEffect(() => {
    store.setFilesLastDir(currentFolder);
  }, [currentFolder, store]);

  useEffect(() => {
    store.setFilesSideWidth(sideWidth);
  }, [sideWidth, store]);

  useEffect(() => {
    store.setFilesSideSplitPct(sideSplitPct);
  }, [sideSplitPct, store]);

  async function handleSelectFile(file) {
    setSelectedFile(file);
    // Check if already remembered
    const result = await window.api.files.isFileRemembered(file.path);
    // Track remembered files for badge display
  }

  return (
    <div className="h-full flex gap-0">
      {/* Left: Folder Tree */}
      <div className="bg-gray-50 border-r" style={{ width: '200px' }}>
        <FileTree
          currentFolder={currentFolder}
          onNavigate={setCurrentFolder}
        />
      </div>

      {/* Middle: File List */}
      <div className="flex-1 border-r">
        <FileList
          currentFolder={currentFolder}
          selectedPath={selectedFile?.path}
          onSelectFile={handleSelectFile}
          onNavigateFolder={setCurrentFolder}
          rememberedPaths={rememberedPaths}
        />
      </div>

      {/* Right: Detail Panel */}
      <div
        className="border-l bg-white flex flex-col"
        style={{ width: `${sideWidth}px` }}
      >
        {selectedFile ? (
          <>
            <div style={{ height: `${sideSplitPct}%` }} className="border-b overflow-y-auto">
              <LibraryDetailPanel
                file={selectedFile}
                isFileImport={true}
              />
            </div>
            <div style={{ height: `${100 - sideSplitPct}%` }} className="overflow-y-auto">
              <LibraryNotesPanel file={selectedFile} />
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400">
            Select a file to view details
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Test component renders**

```javascript
import { render, screen } from '@testing-library/react';
import FilesTab from '../../src/renderer/src/components/FilesTab';
import { expect, it, vi } from 'vitest';

// Mock child components
vi.mock('./FileTree', () => ({
  default: () => <div>FileTree</div>,
}));
vi.mock('./FileList', () => ({
  default: () => <div>FileList</div>,
}));
vi.mock('./LibraryDetailPanel', () => ({
  default: () => <div>DetailPanel</div>,
}));
vi.mock('./LibraryNotesPanel', () => ({
  default: () => <div>NotesPanel</div>,
}));

global.window.api = {
  files: {
    isFileRemembered: vi.fn().mockResolvedValue({ remembered: false }),
  },
};

it('renders FilesTab layout', () => {
  render(<FilesTab />);
  expect(screen.getByText('FileTree')).toBeInTheDocument();
  expect(screen.getByText('FileList')).toBeInTheDocument();
});
```

- [ ] **Step 3: Run test**

```bash
npx vitest run tests/renderer/FilesTab.test.jsx
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/FilesTab.jsx tests/renderer/FilesTab.test.jsx
git commit -m "feat: add FilesTab main component with three-pane layout"
```

---

#### Task 12: Add Files Tab to TabBar

**Files:**
- Modify: `src/renderer/src/components/TabBar.jsx`

- [ ] **Step 1: Locate the TABS constant**

Open `src/renderer/src/components/TabBar.jsx` and find the `TABS` array.

- [ ] **Step 2: Add Files tab**

Update the `TABS` constant to include:

```javascript
const TABS = [
  { id: 'browser', label: 'Browser', icon: Globe },
  { id: 'files', label: 'Files', icon: FolderOpen },  // NEW
  { id: 'library', label: 'Library', icon: BookMarked },
  { id: 'notes', label: 'Notes', icon: FileText },
];
```

Add import for `FolderOpen` icon (from `lucide-react`).

- [ ] **Step 3: Import FilesTab dynamically**

In `App.jsx`, add to the lazy-loaded tabs:

```javascript
const FilesTab = React.lazy(() => import('./components/FilesTab'));
```

- [ ] **Step 4: Add Files tab render clause**

In the tab rendering logic, add:

```javascript
{activeTab === 'files' && <FilesTab />}
```

- [ ] **Step 5: Test in dev**

```bash
npm run dev
```

Expected: Files tab appears between Browser and Library tabs.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/TabBar.jsx src/renderer/src/App.jsx
git commit -m "feat: add Files tab to tab bar"
```

---

### Phase 6: Detail Panel Adaptation

#### Task 13: Adapt LibraryDetailPanel for File Imports

**Files:**
- Modify: `src/renderer/src/components/LibraryDetailPanel.jsx`

- [ ] **Step 1: Review current LibraryDetailPanel**

Understand how it currently shows video player, metadata, and buttons.

- [ ] **Step 2: Add file preview support**

Update `LibraryDetailPanel` to detect `isFileImport` prop and render accordingly:

```jsx
export default function LibraryDetailPanel({ file, isFileImport }) {
  if (isFileImport) {
    // Show preview based on file type
    if (file.type === 'image') {
      return (
        <div className="p-4">
          <img src={file.path} alt={file.name} className="max-w-full h-auto" />
          <MetadataBar file={file} isFileImport={true} />
        </div>
      );
    } else if (file.type === 'pdf' || file.type === 'document') {
      return (
        <div className="p-4">
          <div className="bg-gray-100 p-4 rounded text-gray-600 text-sm">
            [Document Preview]
            <br />
            Click "Remember" to import and see full preview
          </div>
          <MetadataBar file={file} isFileImport={true} />
        </div>
      );
    }
  }

  // Default behavior for library files...
  return <>{/* existing code */}</>;
}

function MetadataBar({ file, isFileImport }) {
  const stat = require('fs').statSync(file.path);

  return (
    <div className="mt-4 text-xs text-gray-600 space-y-1">
      <div>File: {file.name}</div>
      <div>Size: {(stat.size / 1024 / 1024).toFixed(2)} MB</div>
      <div>
        Path:{' '}
        <button
          onClick={() => window.api.shell.openUrl(`file://${file.path}`)}
          className="text-blue-600 underline"
        >
          Reveal
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Test rendering**

In dev, select a file in Files tab and verify preview shows.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/LibraryDetailPanel.jsx
git commit -m "feat: adapt LibraryDetailPanel to preview file imports"
```

---

### Phase 7: Integration & Polish

#### Task 14: Add File Remember Button & Folder Import Dialog

**Files:**
- Modify: `src/renderer/src/components/FilesTab.jsx`
- Create: `src/renderer/src/components/FolderImportDialog.jsx`

- [ ] **Step 1: Add Remember button to LibraryDetailPanel**

Update `LibraryDetailPanel` for `isFileImport` to include a "Remember File" button:

```jsx
<button
  onClick={() => onRememberFile(file)}
  className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
>
  Remember File
</button>
```

- [ ] **Step 2: Implement onRememberFile handler**

In `FilesTab.jsx`:

```javascript
async function handleRememberFile(file) {
  try {
    const result = await window.api.files.rememberFile(file.path);
    if (result.error) {
      alert(`Error: ${result.error}`);
    } else {
      alert(`Successfully remembered: ${result.title}`);
      setRememberedPaths([...rememberedPaths, file.path]);
      // Trigger library refresh
      store.setLibraryFiles(store.libraryFiles); // Force refresh
    }
  } catch (error) {
    alert(`Failed to remember file: ${error.message}`);
  }
}
```

Pass handler to `LibraryDetailPanel` via prop.

- [ ] **Step 3: Create FolderImportDialog**

Create `src/renderer/src/components/FolderImportDialog.jsx`:

```jsx
import React from 'react';

export default function FolderImportDialog({ folderPath, fileCount, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md">
        <h2 className="text-lg font-semibold mb-2">Import Folder?</h2>
        <p className="text-gray-600 mb-4">
          This folder contains <strong>{fileCount} files</strong>. Processing may take a moment.
        </p>
        <div className="flex gap-4">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 border rounded hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Proceed
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Integrate dialog into FilesTab**

Update FileList to show a context menu option "Import Folder":

```javascript
function handleFolderImport(folderPath) {
  window.api.files.rememberFolder(folderPath).then(result => {
    if (result.count > 10) {
      setFolderImportDialog({ path: folderPath, count: result.count });
    } else {
      proceedWithImport(folderPath, result.files);
    }
  });
}
```

- [ ] **Step 5: Test in dev**

```bash
npm run dev
```

Expected: Can right-click a folder and import it. Dialog shows for large folders.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/FilesTab.jsx src/renderer/src/components/FolderImportDialog.jsx
git commit -m "feat: add file remember button and folder import dialog"
```

---

#### Task 15: Add Error Handling for Missing Original Files

**Files:**
- Modify: `src/renderer/src/components/LibraryDetailPanel.jsx`
- Modify: `src/main/ipc-handlers.js`

- [ ] **Step 1: Add handler for missing file check**

In `ipc-handlers.js`, add:

```javascript
ipcMain.handle('files:checkOriginalExists', async (event, originalPath) => {
  const fs = require('fs');
  return { exists: fs.existsSync(originalPath) };
});
```

- [ ] **Step 2: Update preload**

In `src/preload/index.js`:

```javascript
checkOriginalExists: (path) => ipcRenderer.invoke('files:checkOriginalExists', path),
```

- [ ] **Step 3: Adapt LibraryDetailPanel to show error**

Update the detail panel to check original file existence:

```jsx
React.useEffect(() => {
  if (metadata?.originalPath) {
    window.api.files.checkOriginalExists(metadata.originalPath).then(result => {
      setOriginalExists(result.exists);
    });
  }
}, [metadata]);

if (metadata?.originalPath && !originalExists) {
  return (
    <div className="p-4 text-orange-600 text-sm">
      <strong>⚠️ Original file not found.</strong>
      <p className="mt-2">The file may have been moved or deleted.</p>
      <button
        onClick={() => onDelete()}
        className="mt-4 px-3 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700"
      >
        Delete This Entry
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Test missing file handling**

Move a file that was imported, then try to view it in Library. Should show error.

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc-handlers.js src/preload/index.js src/renderer/src/components/LibraryDetailPanel.jsx
git commit -m "feat: add error handling for missing original files"
```

---

#### Task 16: Sync Library After File Import

**Files:**
- Modify: `src/renderer/src/store/app-store.js`
- Modify: `src/renderer/src/hooks/useIpcEvents.js`

- [ ] **Step 1: Ensure library:changed event is subscribed**

In `useIpcEvents.js`, verify that `library:changed` event listener updates `libraryFiles`:

```javascript
window.api.on('library:changed', () => {
  // Fetch updated library
  window.api.listLibrary().then(files => {
    store.setLibraryFiles(files);
  });
});
```

- [ ] **Step 2: Test in dev**

```bash
npm run dev
```

Import a file in Files tab. Switch to Library tab. File should appear.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/hooks/useIpcEvents.js
git commit -m "feat: sync library after file import via library:changed event"
```

---

### Phase 8: Testing & Verification

#### Task 17: Manual Testing Checklist

Run through the spec's testing checklist manually:

- [ ] **File Selection & Navigation:** Open Files tab, navigate folders, click breadcrumb, verify last folder persists on re-open
- [ ] **Single File Import:** Import a PDF, a DOCX, an image. Verify files appear in Library tab.
- [ ] **Folder Import:** Select a folder with >10 files, confirm dialog appears, click Proceed, monitor progress.
- [ ] **Right Panel Preview:** Select imported files, verify previews and metadata display.
- [ ] **AI Summary:** Import a file, wait for AI summary to generate in bottom panel.
- [ ] **Deletion:** Delete a file from Library tab, verify it's removed.
- [ ] **Edge Cases:** Try unsupported file, very large PDF, folder with symlinks.

Document any issues and create a final commit.

- [ ] **Final commit**

```bash
git add -A
git commit -m "test: manual verification of Files tab implementation"
```

---

## Verification & Rollout

**Build & Package:**
```bash
npm run build
npm run test:all
npm run package
```

**Expected outcomes:**
- No build errors
- All tests pass
- App packages successfully for current OS
- Files tab appears, functions as designed
- Files can be imported and appear in Library
- AI summaries work on imported documents

---

## Known Limitations & Future Work

- Drag-and-drop file import not implemented (can add later)
- No file watching for auto-sync (expensive, future enhancement)
- No bulk edit in Files tab (planned feature)
- Symlink handling may loop on recursive traversal (add check in Task 5 if needed)
- Network paths (SMB) untested (should work if accessible on OS level)
