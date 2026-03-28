import fs from 'fs'
import path from 'path'
import { callLLM, callLLMWithVideo } from './ai-client.js'
import logger from './logger.js'

const YOUTUBE_RE = /youtube\.com|youtu\.be/

/** Generate a summary for a video. Returns the summary string. */
export async function generateSummary(filePath, metadata, config) {
  const startTime = Date.now()
  logger.info('summarize', `Started: ${path.basename(filePath)}`, {
    filename: path.basename(filePath),
    provider: config.aiProvider,
    model: config.aiModel
  })

  try {
    const { aiProvider, aiApiKey, aiModel, defaultSummaryPrompt } = config
    const folderPath = path.dirname(filePath)
    const customPromptPath = path.join(folderPath, 'summary-prompt.md')

    let prompt = defaultSummaryPrompt || 'Summarize this video in 3-5 sentences.'
    if (fs.existsSync(customPromptPath)) {
      const custom = fs.readFileSync(customPromptPath, 'utf8').trim()
      if (custom) prompt = custom
    }

    const isYouTube = metadata.url && YOUTUBE_RE.test(metadata.url)

    let result
    if (aiProvider === 'gemini' && isYouTube) {
      result = await callLLMWithVideo(aiProvider, aiApiKey, aiModel || '', prompt, metadata.url)
    } else {
      // Text metadata path for all other cases
      const titleLine = `Title: ${metadata.title || 'Unknown'}`
      const uploaderLine = `Uploader: ${metadata.uploader || 'Unknown'}`
      const descLine = `Description: ${(metadata.description || '').slice(0, 500)}`
      const userContent = `${prompt}\n\n${titleLine}\n${uploaderLine}\n${descLine}`

      result = await callLLM(aiProvider, aiApiKey, aiModel || '', [{ role: 'user', content: userContent }])
    }

    const duration = (Date.now() - startTime) / 1000
    logger.info('summarize', `Completed: ${path.basename(filePath)}`, {
      filename: path.basename(filePath),
      provider: config.aiProvider,
      model: config.aiModel,
      duration: `${duration.toFixed(2)}s`
    })

    return result
  } catch (error) {
    logger.error('summarize', `Failed: ${path.basename(filePath)}`, {
      filename: path.basename(filePath),
      error: error.message
    })
    throw error
  }
}
