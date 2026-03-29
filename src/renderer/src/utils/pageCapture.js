import { Readability } from '@mozilla/readability'
import TurndownService from 'turndown'

const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-'
})

/**
 * Convert image URLs to base64 data URIs
 * @param {string} markdown - Markdown string with ![alt](url) syntax
 * @returns {Promise<string>} Markdown with base64-encoded images
 */
async function embedImages(markdown) {
  // Match markdown image syntax: ![alt](url)
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g
  let result = markdown
  const matches = [...markdown.matchAll(imageRegex)]

  for (const match of matches) {
    const alt = match[1]
    const url = match[2]

    // Skip data URIs and non-http(s) URLs
    if (url.startsWith('data:') || !url.match(/^https?:\/\//)) {
      continue
    }

    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      })
      if (!response.ok) continue

      const blob = await response.blob()
      const reader = new FileReader()

      const dataUri = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result)
        reader.onerror = reject
        reader.readAsDataURL(blob)
      })

      // Replace the image URL with data URI
      const originalMarkdown = `![${alt}](${url})`
      result = result.replace(originalMarkdown, `![${alt}](${dataUri})`)
    } catch (error) {
      console.error(`Failed to fetch image ${url}:`, error)
      // Continue with original URL on error
    }
  }

  return result
}

/**
 * Extract and parse HTML from webview
 * @param {HTMLElement} webviewRef - Reference to the webview element
 * @returns {Promise<{title, siteName, url, markdown}>}
 */
export async function captureFromWebview(webviewRef) {
  if (!webviewRef) {
    throw new Error('Webview reference is required')
  }

  // Execute JavaScript in webview to get the HTML
  const html = await webviewRef.executeJavaScript('document.documentElement.outerHTML')

  // Parse and process in renderer
  const doc = new DOMParser().parseFromString(html, 'text/html')

  // Extract metadata
  const title =
    doc.querySelector('meta[property="og:title"]')?.getAttribute('content') ||
    doc.querySelector('title')?.textContent ||
    'Untitled'

  const siteName =
    doc.querySelector('meta[property="og:site_name"]')?.getAttribute('content') ||
    doc.querySelector('meta[name="author"]')?.getAttribute('content') ||
    new URL(doc.location || 'http://unknown').hostname

  const url = doc.location?.href || 'unknown'

  // Use Readability to extract article content
  const reader = new Readability(doc.cloneNode(true))
  const article = reader.parse()

  if (!article) {
    throw new Error('Could not extract page content')
  }

  // Convert to markdown
  const markdown = turndownService.turndown(article.content)

  // Embed images as base64
  const markdownWithImages = await embedImages(markdown)

  return {
    title,
    siteName,
    url,
    markdown: markdownWithImages
  }
}

/**
 * Fetch and extract content from a URL (for live viewing)
 * @param {string} url - URL to fetch
 * @returns {Promise<{title, siteName, url, markdown}>}
 */
export async function captureFromUrl(url) {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const html = await response.text()
    const doc = new DOMParser().parseFromString(html, 'text/html')

    // Set document URL for proper relative link resolution
    const baseElement = doc.createElement('base')
    baseElement.href = url
    doc.head.insertBefore(baseElement, doc.head.firstChild)

    // Extract metadata
    const title =
      doc.querySelector('meta[property="og:title"]')?.getAttribute('content') ||
      doc.querySelector('title')?.textContent ||
      'Untitled'

    const siteName =
      doc.querySelector('meta[property="og:site_name"]')?.getAttribute('content') ||
      new URL(url).hostname

    // Use Readability to extract article content
    const reader = new Readability(doc.cloneNode(true))
    const article = reader.parse()

    if (!article) {
      throw new Error('Could not extract page content')
    }

    // Convert to markdown (keep image URLs remote, no base64 for live view)
    const markdown = turndownService.turndown(article.content)

    return {
      title,
      siteName,
      url,
      markdown
    }
  } catch (error) {
    throw new Error(`Failed to capture page from ${url}: ${error.message}`)
  }
}
