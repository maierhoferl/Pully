# Cerebrum

> OpenWolf's learning memory. Updated automatically as the AI learns from interactions.
> Do not edit manually unless correcting an error.
> Last updated: 2026-03-29

## User Preferences

- **Design Consistency:** User prefers Files Tab to match Library Tab's dark theme with indigo/accent colors, not generic light gray styling
- **Text Visibility:** All text in dark theme should be white, not grey (better readability)
- **FileList Toolbar:** User wants easy navigation with parent directory button, select all/deselect all buttons
- **Inline Actions:** User wants inline remember buttons on files, visible on hover or when already remembered

## Key Learnings

- **Project:** pully
- **Description:** Pully — video downloader
- **Page Content Flow:** When a webpage is "remembered" (contentType='page'), the page content (extracted via DOM from h1/h2/h3/p/li elements) must be: (1) captured in the Browser, (2) passed through the IPC handler to metadata.page, (3) included in the LLM request for summarization. For Gemini: page content forces fallback to text path (avoids YouTube video API). For other providers: page content is always included in the prompt.
- **YouTube Video Detection:** YouTube blocks yt-dlp aggressively (rate limiting, auth requirements). Solution: use JavaScript DOM extraction as primary method for YouTube (instant, 100% reliable), with yt-dlp as fallback for other sites. This is more reliable than trying to fix yt-dlp alone.
- **Electron IPC Handler Lifecycle:** IPC handlers registered via `ipcMain.handle()` are **global** and should be registered exactly once at app startup (in `app.whenReady()`), not inside `createWindow()`. Multiple window creations will try to re-register the same handlers, causing "Attempted to register a second handler for X" crash. Use a guard flag if handlers must be registered in a function called multiple times.
- **Tailwind h-screen in Electron:** When using Tailwind's `h-screen` (height: 100vh) in Electron renderer, the HTML and body elements must have explicit `height: 100%` and `width: 100%` with `margin: 0; padding: 0;` or the root container collapses to 0 height and nothing renders. The React root div also needs explicit height.
- **Electron IPC Handler Initialization Order:** IPC handlers must be registered BEFORE the window loads the renderer URL, not after. If the window is created and loads immediately (via loadURL/loadFile), the renderer mounts and calls window.api methods before handlers are registered, causing all IPC calls to fail silently. The sequence must be: (1) register handlers, (2) create window, (3) load URL. Use a getter function pattern if the handler needs mainWindow reference that isn't available yet—handlers can call getMainWindow() to get the current window reference at invocation time, not registration time.
- **Files Tab Tree Navigation:** FileTree should start at home directory (os.homedir()) with lazy-loaded children. When user navigates in the middle (FileList), the left panel should sync to highlight the current folder. Use `useEffect` on `currentFolder` prop to expand parent paths automatically. Only render chevron icons for folders with actual children.
- **FileList Toolbar Pattern:** Use a toolbar with border-bottom above the scrolling list. Include parent directory button (disabled at root), select all/deselect all buttons. Use `|` divider between button groups. Show inline action buttons (like remember) with group-hover visibility.

## Do-Not-Repeat

<!-- Mistakes made and corrected. Each entry prevents the same mistake recurring. -->
<!-- Format: [YYYY-MM-DD] Description of what went wrong and what to do instead. -->

## Decision Log

- **Obsidian Vault Storage Backend (2026-04-05):** Replaced metadata-index.json + per-folder notes.md with individual Obsidian .md notes per content item. Each note uses YAML frontmatter (snake_case keys: title, url, uploader, description, downloaded_at, content_type, file, thumbnail, type, tags) + ## AI Summary + ## My Notes sections. Reference items are pure .md notes (type: reference, no media file). The outputFolder IS the Obsidian vault; .obsidian/app.json is created on startup. Old .ref files are gone — replaced by standalone .md notes. The isReference flag is now set in library entries instead of checking .ref extension.
- **Note Naming Convention:** `video.mp4` → companion note `video.md` (same stem). getNotePath() handles the mapping; is identity for .md files. Sidecar notes are identified by having `file:` in frontmatter pointing to an existing media file.
