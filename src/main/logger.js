import fs from 'fs'
import path from 'path'

/**
 * Creates a logger instance that writes to daily JSON Lines files.
 * @param {string} logDir - Directory where log files will be stored
 * @returns {object} Logger object with methods: info, warn, error, setWindow, setDebugMode
 */
export function createLogger(logDir) {
  let mainWindow = null
  let debugMode = false

  /**
   * Write a log entry to file and optionally send via IPC.
   * @param {string} level - Log level: 'info', 'warn', 'error'
   * @param {string} category - Log category: 'download', 'classify', 'summarize', 'notes', 'app'
   * @param {string} message - Log message
   * @param {object} meta - Optional metadata
   */
  function writeEntry(level, category, message, meta) {
    const entry = {
      ts: new Date().toISOString(),
      level,
      category,
      message,
    }

    // Only include meta if provided
    if (meta !== undefined) {
      entry.meta = meta
    }

    // Write to file
    const today = new Date().toISOString().split('T')[0]
    const logFile = path.join(logDir, `${today}.log`)

    // Ensure directory exists
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true })
    }

    fs.appendFileSync(logFile, JSON.stringify(entry) + '\n', 'utf-8')

    // Send via IPC if debug mode enabled and window is set
    if (debugMode && mainWindow) {
      try {
        mainWindow.webContents.send('log:entry', entry)
      } catch (err) {
        // Silently fail if window is closed or webContents unavailable
      }
    }
  }

  /**
   * Log an info level message
   */
  function info(category, message, meta) {
    writeEntry('info', category, message, meta)
  }

  /**
   * Log a warn level message
   */
  function warn(category, message, meta) {
    writeEntry('warn', category, message, meta)
  }

  /**
   * Log an error level message
   */
  function error(category, message, meta) {
    writeEntry('error', category, message, meta)
  }

  /**
   * Set the main window for IPC event sending
   */
  function setWindow(window) {
    mainWindow = window
  }

  /**
   * Enable/disable debug mode and cleanup old logs when enabling
   */
  function setDebugMode(enabled) {
    debugMode = enabled

    if (enabled) {
      // Auto-cleanup: delete log files older than 3 days
      const cutoffTime = Date.now() - 3 * 24 * 60 * 60 * 1000
      try {
        if (fs.existsSync(logDir)) {
          const files = fs.readdirSync(logDir)
          for (const file of files) {
            if (file.endsWith('.log')) {
              const filePath = path.join(logDir, file)
              const stats = fs.statSync(filePath)
              if (stats.mtimeMs < cutoffTime) {
                fs.unlinkSync(filePath)
              }
            }
          }
        }
      } catch (err) {
        // Silently fail on cleanup errors
      }
    }
  }

  return {
    info,
    warn,
    error,
    setWindow,
    setDebugMode,
  }
}

// Singleton instance — initialized in index.js after app.getPath is available
let loggerInstance = null

export function initializeLogger(logDir) {
  loggerInstance = createLogger(logDir)
  return loggerInstance
}

export default {
  info: (category, message, meta) => loggerInstance?.info(category, message, meta),
  warn: (category, message, meta) => loggerInstance?.warn(category, message, meta),
  error: (category, message, meta) => loggerInstance?.error(category, message, meta),
  setWindow: (window) => loggerInstance?.setWindow(window),
  setDebugMode: (enabled) => loggerInstance?.setDebugMode(enabled),
}
