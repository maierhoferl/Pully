# Cerebrum

> OpenWolf's learning memory. Updated automatically as the AI learns from interactions.
> Do not edit manually unless correcting an error.
> Last updated: 2026-03-29

## User Preferences

- **Design Consistency:** User prefers Files Tab to match Library Tab's dark theme with indigo/accent colors, not generic light gray styling

## Key Learnings

- **Project:** pully
- **Description:** Pully — video downloader
- **Page Content Flow:** When a webpage is "remembered" (contentType='page'), the page content (extracted via DOM from h1/h2/h3/p/li elements) must be: (1) captured in the Browser, (2) passed through the IPC handler to metadata.page, (3) included in the LLM request for summarization. For Gemini: page content forces fallback to text path (avoids YouTube video API). For other providers: page content is always included in the prompt.
- **YouTube Video Detection:** YouTube blocks yt-dlp aggressively (rate limiting, auth requirements). Solution: use JavaScript DOM extraction as primary method for YouTube (instant, 100% reliable), with yt-dlp as fallback for other sites. This is more reliable than trying to fix yt-dlp alone.
- **Electron IPC Handler Lifecycle:** IPC handlers registered via `ipcMain.handle()` are **global** and should be registered exactly once at app startup (in `app.whenReady()`), not inside `createWindow()`. Multiple window creations will try to re-register the same handlers, causing "Attempted to register a second handler for X" crash. Use a guard flag if handlers must be registered in a function called multiple times.
- **Tailwind h-screen in Electron:** When using Tailwind's `h-screen` (height: 100vh) in Electron renderer, the HTML and body elements must have explicit `height: 100%` and `width: 100%` with `margin: 0; padding: 0;` or the root container collapses to 0 height and nothing renders. The React root div also needs explicit height.
- **Electron IPC Handler Initialization Order:** IPC handlers must be registered BEFORE the window loads the renderer URL, not after. If the window is created and loads immediately (via loadURL/loadFile), the renderer mounts and calls window.api methods before handlers are registered, causing all IPC calls to fail silently. The sequence must be: (1) register handlers, (2) create window, (3) load URL. Use a getter function pattern if the handler needs mainWindow reference that isn't available yet—handlers can call getMainWindow() to get the current window reference at invocation time, not registration time.

## Do-Not-Repeat

<!-- Mistakes made and corrected. Each entry prevents the same mistake recurring. -->
<!-- Format: [YYYY-MM-DD] Description of what went wrong and what to do instead. -->

## Decision Log

<!-- Significant technical decisions with rationale. Why X was chosen over Y. -->
