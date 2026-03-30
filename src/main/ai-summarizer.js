import fs from 'fs'
import path from 'path'
import { callLLM, callLLMWithVideo } from './ai-client.js'
import { writeSummarySection, readFolderNotes } from './notes-store.js'
import logger from './logger.js'

const YOUTUBE_RE = /youtube\.com|youtu\.be/

/** Generate a summary for a video. Returns the summary string. */
export async function generateSummary(filePath, metadata, config) {
  const startTime = Date.now()
  const model = config.autoSummarizeModel || config.aiModel || ''
  logger.info('summarize', `Started: ${path.basename(filePath)}`, {
    filename: path.basename(filePath),
    provider: config.aiProvider,
    model
  })

  try {
    const { aiProvider, aiApiKey, defaultSummaryPrompt, outputFolder } = config
    const folderPath = path.dirname(filePath)
    const customPromptPath = path.join(folderPath, 'summary-prompt.md')
    const agentCommandPath = outputFolder
      ? path.join(outputFolder, '.agent', 'commands', 'summarize.md')
      : null

    let prompt =
      defaultSummaryPrompt ||
      'Summarize the key topics and insights in Markdown format. Use bullet points for key takeaways, bold for important concepts, and additional formatting as needed. Cover the what, why, how and the implications. Use concise language of an expert. Never go beyond what is covered.'
    let promptSource = 'default'

    // Priority 1: Per-folder custom prompt (highest priority)
    if (fs.existsSync(customPromptPath)) {
      const custom = fs.readFileSync(customPromptPath, 'utf8').trim()
      if (custom) {
        prompt = custom
        promptSource = 'custom'
      }
    }
    // Priority 2: Library-wide .agent/commands/summarize.md (second priority)
    else if (agentCommandPath && fs.existsSync(agentCommandPath)) {
      const agentContent = fs.readFileSync(agentCommandPath, 'utf8')
      // Extract prompt from frontmatter+content
      const match = agentContent.match(/^---[\s\S]*?---\n([\s\S]*)$/)
      const agentPrompt = match ? match[1].trim() : agentContent.trim()
      if (agentPrompt) {
        prompt = agentPrompt
        promptSource = 'agent-command'
      }
    }

    logger.info('summarize', `Prompt loaded`, {
      filename: path.basename(filePath),
      promptSource,
      promptPreview: prompt.slice(0, 100)
    })

    const isYouTube = metadata.url && YOUTUBE_RE.test(metadata.url)

    let result
    if (aiProvider === 'gemini' && isYouTube && !metadata.page) {
      logger.info('summarize', `Using YouTube-native API`, {
        filename: path.basename(filePath),
        provider: 'gemini',
        url: metadata.url
      })
      result = await callLLMWithVideo(aiProvider, aiApiKey, model, prompt, metadata.url)
    } else {
      // Text metadata path for all other cases (including pages with content)
      const titleLine = `Title: ${metadata.title || 'Unknown'}`
      const uploaderLine = `Uploader: ${metadata.uploader || 'Unknown'}`
      const descLine = `Description: ${(metadata.description || '').slice(0, 500)}`
      const pageLine = metadata.page ? `\n\nPage Content:\n${metadata.page.slice(0, 2000)}` : ''
      const userContent = `${prompt}\n\n${titleLine}\n${uploaderLine}\n${descLine}${pageLine}`

      logger.info('summarize', `Sending to LLM`, {
        filename: path.basename(filePath),
        provider: aiProvider,
        model,
        userContentPreview: userContent.slice(0, 150),
        hasPageContent: !!metadata.page
      })

      result = await callLLM(aiProvider, aiApiKey, model, [{ role: 'user', content: userContent }])
    }

    logger.info('summarize', `Response received`, {
      filename: path.basename(filePath),
      responsePreview: result.slice(0, 200)
    })

    const duration = (Date.now() - startTime) / 1000
    logger.info('summarize', `Completed: ${path.basename(filePath)}`, {
      filename: path.basename(filePath),
      provider: config.aiProvider,
      model,
      duration: `${duration.toFixed(2)}s`,
      responseLength: result.length
    })

    // Write summary section and emit event for real-time renderer update
    // Only store if response is non-empty (valid)
    if (outputFolder && result && result.trim()) {
      writeSummarySection(filePath, result, outputFolder)
    }

    return result
  } catch (error) {
    logger.error('summarize', `Failed: ${path.basename(filePath)}`, {
      filename: path.basename(filePath),
      provider: config.aiProvider,
      model,
      error: error.message
    })
    throw error
  }
}
