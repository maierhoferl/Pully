const DEFAULT_MODELS = {
  gemini: 'gemini-2.0-flash',
  claude: 'claude-haiku-4-6',
  openai: 'gpt-4o-mini'
}

/** Call an LLM with a messages array. Returns the response text string. */
export async function callLLM(provider, apiKey, model, messages) {
  const m = model || DEFAULT_MODELS[provider]
  if (provider === 'gemini') return _callGemini(apiKey, m, messages)
  if (provider === 'claude') return _callClaude(apiKey, m, messages)
  if (provider === 'openai') return _callOpenAI(apiKey, m, messages)
  throw new Error(`Unknown AI provider: ${provider}`)
}

/** Call Gemini with a video URL in the request (YouTube native understanding). Falls back to text for non-Gemini. */
export async function callLLMWithVideo(provider, apiKey, model, prompt, videoUrl) {
  const m = model || DEFAULT_MODELS[provider]
  if (provider !== 'gemini') {
    return callLLM(provider, apiKey, m, [{ role: 'user', content: prompt }])
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`
  const body = {
    contents: [
      {
        parts: [{ fileData: { mimeType: 'video/mp4', fileUri: videoUrl } }, { text: prompt }]
      }
    ]
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!res.ok) throw new Error(`Gemini video API error: ${res.status}`)
  const data = await res.json()
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
  if (text == null)
    throw new Error(`Gemini returned no text. Response: ${JSON.stringify(data).slice(0, 200)}`)
  return text
}

/** Fetch available model names for a provider. Returns string[]. */
export async function fetchProviderModels(provider, apiKey) {
  if (provider === 'gemini') {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`)
    if (!res.ok) throw new Error(`Gemini models fetch error: ${res.status}`)
    const data = await res.json()
    return (data.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m) => m.name.replace('models/', ''))
  }
  if (provider === 'claude') {
    const res = await fetch('https://api.anthropic.com/v1/models', {
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
    })
    if (!res.ok) throw new Error(`Claude models fetch error: ${res.status}`)
    const data = await res.json()
    return (data.data || []).map((m) => m.id)
  }
  if (provider === 'openai') {
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` }
    })
    if (!res.ok) throw new Error(`OpenAI models fetch error: ${res.status}`)
    const data = await res.json()
    return (data.data || [])
      .map((m) => m.id)
      .filter((id) => id.startsWith('gpt-'))
      .sort()
  }
  throw new Error(`Unknown provider: ${provider}`)
}

async function _callGemini(apiKey, model, messages) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }))
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents })
  })
  if (!res.ok) throw new Error(`Gemini API error: ${res.status}`)
  const data = await res.json()
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
  if (text == null)
    throw new Error(`Gemini returned no text. Response: ${JSON.stringify(data).slice(0, 200)}`)
  return text
}

async function _callClaude(apiKey, model, messages) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({ model, max_tokens: 2048, messages })
  })
  if (!res.ok) throw new Error(`Claude API error: ${res.status}`)
  const data = await res.json()
  const text = data?.content?.[0]?.text
  if (text == null)
    throw new Error(`Claude returned no text. Response: ${JSON.stringify(data).slice(0, 200)}`)
  return text
}

async function _callOpenAI(apiKey, model, messages) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ model, messages })
  })
  if (!res.ok) throw new Error(`OpenAI API error: ${res.status}`)
  const data = await res.json()
  const text = data?.choices?.[0]?.message?.content
  if (text == null)
    throw new Error(`OpenAI returned no text. Response: ${JSON.stringify(data).slice(0, 200)}`)
  return text
}
