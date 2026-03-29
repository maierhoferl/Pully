import React, { useState } from 'react'
import { useAppStore } from '../store/app-store.js'

const DEFAULT_MODELS = {
  gemini: 'gemini-2.0-flash',
  claude: 'claude-haiku-4-6',
  openai: 'gpt-4o-mini',
}

const PROVIDERS = {
  gemini: { name: 'Google', label: 'Gemini' },
  claude: { name: 'Anthropic', label: 'Claude' },
  openai: { name: 'OpenAI', label: 'GPT' },
}

export function SettingsPanel() {
  const { config, setConfig, setSettingsOpen } = useAppStore()
  const [local, setLocal] = useState({ ...config })
  const [activeTab, setActiveTab] = useState('general')
  const [folderError, setFolderError] = useState('')
  const [availableModels, setAvailableModels] = useState([])
  const [modelsFetching, setModelsFetching] = useState(false)
  const [aiModels, setAiModels] = useState([])

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

  async function handleFetchAiModels() {
    const provider = local.aiProvider || 'gemini'
    const apiKey = local.aiApiKey
    if (!apiKey) return
    try {
      const models = await window.api.fetchAiModels(provider, apiKey)
      setAiModels(models)
    } catch {
      setAiModels([])
    }
  }

  const isCloudProvider = local.autoClassifyProvider && local.autoClassifyProvider !== 'local'

  const renderTabButton = (tab, label) => (
    <button
      onClick={() => setActiveTab(tab)}
      className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
        activeTab === tab
          ? 'text-indigo-500 border-b-indigo-600'
          : 'text-gray-400 border-b-transparent hover:text-gray-300'
      }`}
    >
      {label}
    </button>
  )

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 pt-6 pb-0">
          <h2 className="text-lg font-semibold text-white mb-4">Settings</h2>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-700 flex">
          {renderTabButton('general', 'General')}
          {renderTabButton('knowledge', 'Knowledge Management')}
          {renderTabButton('ai', 'AI')}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* General Tab */}
          {activeTab === 'general' && (
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider">Download Folder</label>
                <div className="flex gap-2">
                  <input readOnly value={local.outputFolder || ''} placeholder="No folder selected"
                    className={`flex-1 bg-gray-800 text-sm text-white px-3 py-2 rounded border cursor-default ${
                      folderError ? 'border-red-500' : 'border-gray-700'
                    }`} />
                  <button onClick={handleBrowse}
                    className="bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm px-3 py-2 rounded border border-gray-700 whitespace-nowrap">
                    Browse…
                  </button>
                </div>
                {folderError && <p className="text-red-400 text-xs mt-1">{folderError}</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider">Max Concurrent Downloads</label>
                <div className="flex items-center gap-3">
                  <input type="number" min={1} max={5} value={local.maxConcurrent}
                    onChange={e => setLocal(c => ({ ...c, maxConcurrent: Math.max(1, parseInt(e.target.value) || 1) }))}
                    className="w-16 bg-gray-800 text-white text-sm px-3 py-2 rounded border border-gray-700 focus:outline-none focus:border-indigo-600" />
                  <span className="text-xs text-gray-500">Between 1 and 5</span>
                </div>
              </div>

              <div className="border-t border-gray-800 pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-white">Debug Mode</div>
                    <div className="text-xs text-gray-500 mt-1">Shows Debug tab and writes logs to disk</div>
                  </div>
                  <button
                    onClick={() => setLocal(c => ({ ...c, debugMode: !c.debugMode }))}
                    className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0 ${
                      local.debugMode ? 'bg-indigo-600' : 'bg-gray-700'
                    }`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                      local.debugMode ? 'translate-x-4' : 'translate-x-0'
                    }`} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Knowledge Management Tab */}
          {activeTab === 'knowledge' && (
            <div className="space-y-4">
              {/* Auto-Classify Card */}
              <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="text-sm font-semibold text-white">Auto-Classify</div>
                    <div className="text-xs text-gray-400 mt-1">Auto-assign downloads to library folders</div>
                  </div>
                  <button
                    onClick={() => setLocal(c => ({ ...c, autoClassifyEnabled: !c.autoClassifyEnabled }))}
                    className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0 ${
                      local.autoClassifyEnabled ? 'bg-indigo-600' : 'bg-gray-700'
                    }`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                      local.autoClassifyEnabled ? 'translate-x-4' : 'translate-x-0'
                    }`} />
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider">Model Override</label>
                  <input
                    type="text"
                    value={local.autoClassifyModel || ''}
                    onChange={e => setLocal(c => ({ ...c, autoClassifyModel: e.target.value }))}
                    placeholder="Using AI tab default"
                    className="w-full bg-gray-700 text-white text-sm px-3 py-2 rounded border border-gray-600 focus:outline-none focus:border-indigo-600"
                  />
                  <p className="text-xs text-gray-500 mt-1">Leave blank to use the model configured in the AI tab</p>
                </div>
              </div>

              {/* Auto-Summarize Card */}
              <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="text-sm font-semibold text-white">Auto-Summarize</div>
                    <div className="text-xs text-gray-400 mt-1">Generate notes summary after download</div>
                  </div>
                  <button
                    onClick={() => setLocal(c => ({ ...c, autoSummarizeEnabled: !c.autoSummarizeEnabled }))}
                    className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0 ${
                      local.autoSummarizeEnabled ? 'bg-indigo-600' : 'bg-gray-700'
                    }`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                      local.autoSummarizeEnabled ? 'translate-x-4' : 'translate-x-0'
                    }`} />
                  </button>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider">Model Override</label>
                    <input
                      type="text"
                      value={local.autoSummarizeModel || ''}
                      onChange={e => setLocal(c => ({ ...c, autoSummarizeModel: e.target.value }))}
                      placeholder="Using AI tab default"
                      className="w-full bg-gray-700 text-white text-sm px-3 py-2 rounded border border-gray-600 focus:outline-none focus:border-indigo-600"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider">Default Prompt</label>
                    <textarea
                      value={local.defaultSummaryPrompt || ''}
                      onChange={e => setLocal(c => ({ ...c, defaultSummaryPrompt: e.target.value }))}
                      rows={3}
                      className="w-full bg-gray-700 text-white text-xs px-3 py-2 rounded border border-gray-600 focus:outline-none focus:border-indigo-600 resize-none"
                    />
                    <p className="text-xs text-gray-500 mt-1">Can be overridden per-folder via summary-prompt.md</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* AI Tab */}
          {activeTab === 'ai' && (
            <div className="space-y-5">
              <p className="text-xs text-gray-400">Configure the AI provider used by all AI features. Each feature can override the model in the Knowledge Management tab.</p>

              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-3 uppercase tracking-wider">Provider</label>
                <div className="grid grid-cols-3 gap-2">
                  {['gemini', 'openai', 'claude'].map(provider => (
                    <button
                      key={provider}
                      onClick={() => {
                        setLocal(c => ({ ...c, aiProvider: provider, aiModel: '' }))
                        setAiModels([])
                      }}
                      className={`p-3 rounded-lg border-2 transition-colors text-center ${
                        local.aiProvider === provider
                          ? 'bg-indigo-950 border-indigo-600'
                          : 'bg-gray-800 border-gray-700 hover:border-gray-600'
                      }`}
                    >
                      <div className={`text-sm font-semibold ${
                        local.aiProvider === provider ? 'text-indigo-300' : 'text-gray-300'
                      }`}>
                        {provider === 'gemini' ? 'Google' : provider === 'claude' ? 'Anthropic' : 'OpenAI'}
                      </div>
                      <div className={`text-xs mt-1 ${
                        local.aiProvider === provider ? 'text-indigo-400' : 'text-gray-500'
                      }`}>
                        {PROVIDERS[provider].label}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider">API Key</label>
                <input
                  type="password"
                  value={local.aiApiKey || ''}
                  onChange={e => setLocal(c => ({ ...c, aiApiKey: e.target.value }))}
                  placeholder="Enter API key…"
                  className="w-full bg-gray-800 text-white text-sm px-3 py-2 rounded border border-gray-700 focus:outline-none focus:border-indigo-600 font-mono text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider">
                  Default Model
                  {local.aiApiKey && (
                    <button
                      onClick={handleFetchAiModels}
                      className="ml-2 text-indigo-400 hover:text-indigo-300 text-xs"
                    >
                      (load models)
                    </button>
                  )}
                </label>
                {aiModels.length > 0 ? (
                  <select
                    value={local.aiModel || ''}
                    onChange={e => setLocal(c => ({ ...c, aiModel: e.target.value }))}
                    className="w-full bg-gray-800 text-white text-sm px-3 py-2 rounded border border-gray-700 focus:outline-none focus:border-indigo-600"
                  >
                    <option value="">Default ({DEFAULT_MODELS[local.aiProvider]})</option>
                    {aiModels.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={local.aiModel || ''}
                    onChange={e => setLocal(c => ({ ...c, aiModel: e.target.value }))}
                    placeholder={`Default: ${DEFAULT_MODELS[local.aiProvider]}`}
                    className="w-full bg-gray-800 text-white text-sm px-3 py-2 rounded border border-gray-700 focus:outline-none focus:border-indigo-600"
                  />
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-700 px-6 py-3 flex justify-end gap-2 bg-gray-900">
          <button onClick={() => setSettingsOpen(false)}
            className="text-sm text-gray-400 hover:text-gray-300 px-4 py-2 rounded hover:bg-gray-800 transition-colors">
            Cancel
          </button>
          <button onClick={handleSave}
            className="text-sm bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded font-medium transition-colors">
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
