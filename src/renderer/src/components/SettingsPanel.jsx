import React, { useState } from 'react'
import { useAppStore } from '../store/app-store.js'

const DEFAULT_MODELS = {
  claude: 'claude-haiku-4-6',
  gemini: 'gemini-3.1-flash-lite',
  openai: 'gpt-5-nano',
}

export function SettingsPanel() {
  const { config, setConfig, setSettingsOpen } = useAppStore()
  const [local, setLocal] = useState({ ...config })
  const [folderError, setFolderError] = useState('')
  const [availableModels, setAvailableModels] = useState([])
  const [modelsFetching, setModelsFetching] = useState(false)

  async function handleBrowse() {
    const folder = await window.api.openFolder()
    if (folder) { setLocal(c => ({ ...c, outputFolder: folder })); setFolderError('') }
  }

  async function handleFetchModels() {
    const provider = local.autoClassifyProvider
    const apiKey = local.autoClassifyApiKey
    if (!provider || provider === 'local' || !apiKey) return
    setModelsFetching(true)
    try {
      const models = await window.api.fetchClassifyModels(provider, apiKey)
      setAvailableModels(models)
      if (models.length > 0 && !local.autoClassifyModel) {
        const def = DEFAULT_MODELS[provider]
        setLocal(c => ({ ...c, autoClassifyModel: models.includes(def) ? def : models[0] }))
      }
    } catch {
      setAvailableModels([])
    } finally {
      setModelsFetching(false)
    }
  }

  async function handleSave() {
    if (!local.outputFolder) { setFolderError('Please select an output folder.'); return }
    const saved = await window.api.writeConfig(local)
    setConfig(saved)
    setSettingsOpen(false)
  }

  const isCloudProvider = local.autoClassifyProvider && local.autoClassifyProvider !== 'local'

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
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

        <div className="mb-4">
          <label className="block text-sm text-gray-400 mb-1">Max concurrent downloads</label>
          <input type="number" min={1} max={5} value={local.maxConcurrent}
            onChange={e => setLocal(c => ({ ...c, maxConcurrent: Math.max(1, parseInt(e.target.value) || 1) }))}
            className="w-24 bg-gray-800 text-white text-sm px-3 py-2 rounded border border-gray-600 focus:outline-none focus:border-blue-500" />
        </div>

        <div className="mb-6 border-t border-gray-700 pt-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-gray-400">Auto-classify new downloads</span>
            <button
              onClick={() => setLocal(c => ({ ...c, autoClassifyEnabled: !c.autoClassifyEnabled }))}
              className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${
                local.autoClassifyEnabled ? 'bg-blue-600' : 'bg-gray-600'
              }`}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                local.autoClassifyEnabled ? 'translate-x-5' : 'translate-x-0.5'
              }`} />
            </button>
          </div>

          <div className="mb-2">
            <label className="block text-xs text-gray-500 mb-1">Provider</label>
            <select
              value={local.autoClassifyProvider || 'local'}
              onChange={e => {
                setLocal(c => ({ ...c, autoClassifyProvider: e.target.value, autoClassifyApiKey: '', autoClassifyModel: '' }))
                setAvailableModels([])
              }}
              className="w-full bg-gray-800 text-white text-sm px-3 py-2 rounded border border-gray-600 focus:outline-none focus:border-blue-500"
            >
              <option value="local">Local only</option>
              <option value="claude">Claude</option>
              <option value="gemini">Gemini</option>
              <option value="openai">OpenAI</option>
            </select>
          </div>

          {isCloudProvider && (
            <>
              <div className="mb-2">
                <label className="block text-xs text-gray-500 mb-1">API Key</label>
                <input
                  type="password"
                  value={local.autoClassifyApiKey || ''}
                  onChange={e => setLocal(c => ({ ...c, autoClassifyApiKey: e.target.value }))}
                  onBlur={handleFetchModels}
                  placeholder="Enter API key…"
                  className="w-full bg-gray-800 text-white text-sm px-3 py-2 rounded border border-gray-600 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">Model</label>
                {availableModels.length > 0 ? (
                  <select
                    value={local.autoClassifyModel || DEFAULT_MODELS[local.autoClassifyProvider] || ''}
                    onChange={e => setLocal(c => ({ ...c, autoClassifyModel: e.target.value }))}
                    className="w-full bg-gray-800 text-white text-sm px-3 py-2 rounded border border-gray-600 focus:outline-none focus:border-blue-500"
                  >
                    {availableModels.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={local.autoClassifyModel || ''}
                    onChange={e => setLocal(c => ({ ...c, autoClassifyModel: e.target.value }))}
                    placeholder={modelsFetching ? 'Loading models…' : (DEFAULT_MODELS[local.autoClassifyProvider] || 'Model name')}
                    className="w-full bg-gray-800 text-white text-sm px-3 py-2 rounded border border-gray-600 focus:outline-none focus:border-blue-500"
                  />
                )}
              </div>
            </>
          )}
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
