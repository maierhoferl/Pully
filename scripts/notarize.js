// Called by electron-builder as afterSign hook.
// Notarizes the macOS app when APPLE_ID env var is set.
// Silently skips on other platforms or when secrets are absent.
const path = require('path')

exports.default = async function notarizing(context) {
  if (context.electronPlatformName !== 'darwin') return
  if (!process.env.APPLE_ID) {
    console.log('Notarization skipped: APPLE_ID not set')
    return
  }

  const { notarize } = require('@electron/notarize')
  const appName = context.packager.appInfo.productFilename
  const appPath = path.join(context.appOutDir, `${appName}.app`)

  console.log(`Notarizing ${appPath}...`)
  return notarize({
    appBundleId: 'com.pully.app',
    appPath,
    appleId: process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_ID_PASSWORD,
    teamId: process.env.APPLE_TEAM_ID,
  })
}
