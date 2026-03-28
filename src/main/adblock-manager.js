import { app } from 'electron'
import { ElectronBlocker } from '@ghostery/adblocker-electron'

// Extra YouTube-specific cosmetic selectors beyond what the prebuilt uBlock Origin lists already cover
const YOUTUBE_EXTRA_CSS =
  [
    'ytd-promoted-sparkles-web-renderer',
    'ytd-ad-slot-renderer',
    '.ytp-ad-overlay-container',
    '.ytp-ad-module',
    '#player-ads',
    'ytd-banner-promo-renderer',
    'ytd-statement-banner-renderer',
    '#masthead-ad',
    'ytd-rich-item-renderer:has(ytd-ad-slot-renderer)'
  ].join(',\n') + ' { display: none !important; }'

let blocker = null
let enabled = false

export async function initAdblock() {
  blocker = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch)
  setupCosmeticInjection()
}

function setupCosmeticInjection() {
  app.on('web-contents-created', (_, contents) => {
    contents.on('did-finish-load', async () => {
      if (!enabled) return
      try {
        const url = contents.getURL()
        if (!url.includes('youtube.com')) return
        await contents.executeJavaScript(`
          if (!document.getElementById('pully-adblock-css')) {
            const s = document.createElement('style')
            s.id = 'pully-adblock-css'
            s.textContent = ${JSON.stringify(YOUTUBE_EXTRA_CSS)}
            document.head.appendChild(s)
          }
        `)
      } catch {
        // webContents may have been destroyed before injection completed
      }
    })
  })
}

export function enableAdblock(session) {
  if (!blocker) return
  blocker.enableBlockingInSession(session)
  enabled = true
}

export function disableAdblock(session) {
  if (!blocker) return
  blocker.disableBlockingInSession(session)
  enabled = false
}

export function isAdblockEnabled() {
  return enabled
}

const UPDATE_INTERVAL_MS = 24 * 60 * 60 * 1000 // 24 hours

async function updateFiltersInBackground(session) {
  try {
    const updated = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch)
    const wasEnabled = enabled
    if (wasEnabled) blocker.disableBlockingInSession(session)
    blocker = updated
    if (wasEnabled) blocker.enableBlockingInSession(session)
  } catch {
    // Silent failure — keep existing blocker, try again at next interval
  }
}

export function startBackgroundUpdates(session) {
  // Initial update 30s after startup so app is fully initialized first
  setTimeout(() => updateFiltersInBackground(session), 30_000)
  // Subsequent updates every 24 hours
  setInterval(() => updateFiltersInBackground(session), UPDATE_INTERVAL_MS)
}
