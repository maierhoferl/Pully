import React, { useState } from 'react'
import { useAppStore } from '../store/app-store.js'

export function SettingsPanel() {
  const { config, setConfig, setSettingsOpen } = useAppStore()
  const [local, setLocal] = useState({ ...config })
  const [folderError, setFolderError] = useState('')

  async function handleBrowse() {
    const folder = await window.api.openFolder()
    if (folder) { setLocal(c => ({ ...c, outputFolder: folder })); setFolderError('') }
  }

  async function handleSave() {
    if (!local.outputFolder) { setFolderError('Please select an output folder.'); return }
    const saved = await window.api.writeConfig(local)
    setConfig(saved)
    setSettingsOpen(false)
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Settings</h2>

        <div className="mb-4">
          <label className="block text-sm text-gray-400 mb-1">Download folder</label>
          <div className="flex gap-2">
            <input readOnly value={local.outputFolder || ''} placeholder="No folder selected"
              className={`flex-1 bg-gray-800 text-sm text-white px-3 py-2 rounded border cursor-default ${
                folderError ? 'border-red-500' : 'border-gray-600'
              }`} />
            <button onClick={handleBrowse}
              className="bg-gray-700 hover:bg-gray-600 text-white text-sm px-3 py-2 rounded border border-gray-600">
              Browse…
            </button>
          </div>
          {folderError && <p className="text-red-400 text-xs mt-1">{folderError}</p>}
        </div>

        <div className="mb-6">
          <label className="block text-sm text-gray-400 mb-1">Max concurrent downloads</label>
          <input type="number" min={1} max={5} value={local.maxConcurrent}
            onChange={e => setLocal(c => ({ ...c, maxConcurrent: Math.max(1, parseInt(e.target.value) || 1) }))}
            className="w-24 bg-gray-800 text-white text-sm px-3 py-2 rounded border border-gray-600 focus:outline-none focus:border-blue-500" />
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={() => setSettingsOpen(false)}
            className="text-sm text-gray-400 hover:text-white px-4 py-2 rounded hover:bg-gray-700">
            Cancel
          </button>
          <button onClick={handleSave}
            className="text-sm bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded font-medium">
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
