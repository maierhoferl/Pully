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
    let promptSource = 'default'
    if (fs.existsSync(customPromptPath)) {
      const custom = fs.readFileSync(customPromptPath, 'utf8').trim()
      if (custom) {
        prompt = custom
        promptSource = 'custom'
      }
    }

    logger.info('summarize', `Prompt loaded`, {
      filename: path.basename(filePath),
      promptSource,
      promptPreview: prompt.slice(0, 100)
    })

    const isYouTube = metadata.url && YOUTUBE_RE.test(metadata.url)

    let result
    if (aiProvider === 'gemini' && isYouTube) {
      logger.info('summarize', `Using YouTube-native API`, {
        filename: path.basename(filePath),
        provider: 'gemini',
        url: metadata.url
      })
      result = await callLLMWithVideo(aiProvider, aiApiKey, aiModel || '', prompt, metadata.url)
    } else {
      // Text metadata path for all other cases
      const titleLine = `Title: ${metadata.title || 'Unknown'}`
      const uploaderLine = `Uploader: ${metadata.uploader || 'Unknown'}`
      const descLine = `Description: ${(metadata.description || '').slice(0, 500)}`
      const userContent = `${prompt}\n\n${titleLine}\n${uploaderLine}\n${descLine}`

      logger.info('summarize', `Sending to LLM`, {
        filename: path.basename(filePath),
        provider: aiProvider,
        model: aiModel,
        userContentPreview: userContent.slice(0, 150)
      })

      result = await callLLM(aiProvider, aiApiKey, aiModel || '', [{ role: 'user', content: userContent }])
    }

    logger.info('summarize', `Response received`, {
      filename: path.basename(filePath),
      responsePreview: result.slice(0, 200)
    })

    const duration = (Date.now() - startTime) / 1000
    logger.info('summarize', `Completed: ${path.basename(filePath)}`, {
      filename: path.basename(filePath),
      provider: config.aiProvider,
      model: config.aiModel,
      duration: `${duration.toFixed(2)}s`,
      responseLength: result.length
    })

    return result
  } catch (error) {
    logger.error('summarize', `Failed: ${path.basename(filePath)}`, {
      filename: path.basename(filePath),
      provider: config.aiProvider,
      model: config.aiModel,
      error: error.message
    })
    throw error
  }
}
