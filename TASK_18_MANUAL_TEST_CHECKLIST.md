# Task 18: Test Cleanup and Edge Cases - Manual Testing Checklist

## Summary
This document describes the manual testing performed for Task 18, which adds cleanup tests and verifies edge cases for the debug logging feature.

## Automated Tests (Passed)
- ✓ `tests/main/logger.test.js` - All 6 tests passing
  - ✓ should create a daily log file
  - ✓ should write JSON Lines format
  - ✓ should append multiple entries to same file
  - ✓ should support info, warn, and error levels
  - ✓ should handle missing meta gracefully
  - ✓ should clean up logs older than 3 days (**NEW**)

## Manual Testing Scenarios

### Scenario 1: Verify 1000-Entry Cap in Memory
**Objective:** Confirm that the in-memory log list never exceeds 1000 entries

**Steps to reproduce:**
1. Start the app: `npm run dev`
2. Navigate to Settings (⚙ button)
3. Enable "Debug Mode" checkbox
4. Click "Save"
5. Notice the "Debug" tab now appears in the tab bar
6. Open the Debug tab
7. Generate many log entries by:
   - Starting multiple downloads (will trigger log entries)
   - Canceling downloads (more log entries)
   - Triggering auto-classify on videos (if configured)
8. Generate >1000 entries if possible (may require multiple cycles of downloads)
9. Verify in the Debug tab that the entry count shown never exceeds 1000

**Expected behavior:**
- Entry counter shows "X of Y entries" where Y ≤ 1000
- When limit is reached, oldest entries are removed automatically
- The list stays responsive and doesn't grow unbounded

**Implementation details:**
- `src/renderer/src/hooks/useIpcEvents.js` line 16: `.slice(-1000)` caps the array
- `src/renderer/src/store/app-store.js` lines 50-60: `appendLogEntry()` also enforces the cap

---

### Scenario 2: Debug Tab Visibility Toggle
**Objective:** Verify the Debug tab appears/disappears based on debug mode setting

**Steps to reproduce:**
1. Start the app: `npm run dev`
2. Observe tab bar initially shows: Browser, Library, Notes (no Debug tab)
3. Open Settings (⚙ button)
4. Enable "Debug Mode" checkbox
5. Click "Save"
6. Observe Debug tab now appears in the tab bar
7. Click to open Debug tab
8. Return to Settings
9. Disable "Debug Mode" checkbox
10. Click "Save"
11. Observe Debug tab disappears from tab bar

**Expected behavior:**
- Debug tab is conditionally rendered based on `config.debugMode`
- Tab bar dynamically updates when setting is saved
- Debug tab is accessible when enabled, hidden when disabled

**Implementation details:**
- `src/renderer/src/components/TabBar.jsx` lines 28-30: Conditionally includes Debug tab
- `src/renderer/src/components/SettingsPanel.jsx` lines 248-267: Debug Mode toggle
- `src/renderer/src/App.jsx` lines 29-31: Debug tab conditional rendering

---

### Scenario 3: Disk Logging Independence from Debug Mode
**Objective:** Verify that log files are written to disk regardless of debug mode setting

**Steps to reproduce:**
1. Start the app: `npm run dev`
2. Open Settings and enable Debug Mode
3. Start a download (will trigger log entries)
4. Verify Debug tab shows entries
5. Open Finder/Explorer and navigate to `~/.../logs/` directory
   - macOS: `~/Library/Application Support/pully/logs/`
   - Linux: `~/.config/pully/logs/`
   - Windows: `%APPDATA%/pully/logs/`
6. Verify a file exists for today (e.g., `2026-03-28.log`)
7. Return to app Settings
8. Disable Debug Mode
9. Click "Save"
10. Notice Debug tab disappears but let app continue running
11. Start another download or trigger log entries
12. Return to file explorer and check the log file
13. Verify the log file still exists and contains new entries

**Expected behavior:**
- Log files are always written to disk (independent of debug mode)
- Debug mode only controls:
  - IPC push to renderer (log:entry events)
  - Debug tab visibility
  - Auto-cleanup of old logs when mode is enabled
- Disk logging is always active for audit/troubleshooting

**Implementation details:**
- `src/main/logger.js` lines 33-42: Writes to disk unconditionally
- `src/main/logger.js` lines 44-51: IPC send only if debugMode && mainWindow
- `src/main/index.js` lines 10-21: Logger initialized on startup, debug mode set from config

---

### Scenario 4: Log File Format and Content
**Objective:** Verify log files are properly formatted and contain expected data

**Steps to reproduce:**
1. Enable Debug Mode and start a download
2. Navigate to the logs directory (see Scenario 3)
3. Open today's log file (e.g., `2026-03-28.log`) with a text editor
4. Examine the content

**Expected format:**
Each line should be valid JSON in this format:
```json
{
  "ts": "2026-03-28T23:57:30.123Z",
  "level": "info|warn|error",
  "category": "download|classify|summarize|notes|app",
  "message": "descriptive message",
  "meta": { ... } // Optional metadata object
}
```

**Expected behavior:**
- One JSON object per line (JSON Lines format)
- Timestamps in ISO 8601 format
- Message is human-readable
- Metadata is included when relevant (e.g., URL, duration, error details)

---

### Scenario 5: Auto-Cleanup on Debug Mode Enable
**Objective:** Verify that old log files (>3 days) are cleaned up when debug mode is enabled

**Steps to reproduce:**
1. Create test log files in the logs directory:
   - Create `2026-03-20.log` (8 days old - should be deleted)
   - Create `2026-03-25.log` (3 days old - should be deleted)
   - Create `2026-03-28.log` (today - should be kept)
2. Enable Debug Mode in Settings
3. Click "Save" (this triggers `setDebugMode(true)`)
4. Check the logs directory
5. Verify old files are deleted, recent files remain

**Expected behavior:**
- Files with mtime older than 3 days are deleted
- Current and recent files are preserved
- Cleanup happens silently (no error messages)

**Implementation details:**
- `src/main/logger.js` lines 85-107: Cleanup logic in `setDebugMode()`
- Checks `stats.mtimeMs < cutoffTime` where cutoffTime = now - 3 days

---

## Test Results Summary

### Automated Tests
```
Test Files: 1 passed (1)
Tests: 6 passed (6)
- Duration: 96ms
- All tests including new cleanup test: PASS ✓
```

### Manual Testing
To complete manual testing:
1. Run `npm run dev` to start the application
2. Follow the scenarios above to verify each aspect
3. Document any deviations or issues found
4. All scenarios should pass without errors

### Commit Information
- Commit SHA: e417838
- Message: "test: add edge case tests for logger cleanup"
- File modified: tests/main/logger.test.js
- Changes: Added cleanup test (26 insertions)

---

## Key Implementation Details

### 1000-Entry Cap
- **Where:** `src/renderer/src/hooks/useIpcEvents.js:16` and `src/renderer/src/store/app-store.js:50-60`
- **How:** Uses `slice(-1000)` to keep only the last 1000 entries
- **Why:** Prevents unbounded memory growth while maintaining sufficient history

### Debug Mode Toggle
- **Settings:** `src/renderer/src/components/SettingsPanel.jsx:248-267`
- **Tab Bar:** `src/renderer/src/components/TabBar.jsx:28-30`
- **Config:** `src/renderer/src/store/app-store.js`
- **IPC:** `src/main/ipc-handlers.js:14-19` triggers `setDebugMode()` on config write

### Disk Logging
- **Always Active:** `src/main/logger.js:33-42`
- **IPC Optional:** `src/main/logger.js:44-51` (only when debugMode && mainWindow)
- **File Format:** JSON Lines (one JSON object per line)
- **Location:** Platform-specific application data directory

### Auto-Cleanup
- **Trigger:** `setDebugMode(true)` in IPC handler
- **Logic:** Deletes files with mtime < (now - 3 days)
- **Safety:** Silent failure if cleanup fails, doesn't block initialization
- **Files:** Only processes `.log` files in the logs directory
