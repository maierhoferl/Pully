import React from 'react'
import VideoPlayer from './VideoPlayer.jsx'
import { IframePlayer } from './IframePlayer.jsx'
import { MarkdownPageView } from './MarkdownPageView.jsx'
import { LivePageView } from './LivePageView.jsx'

/**
 * ContentViewer dispatches the right renderer based on:
 * - isRef: whether this is a referenced (Obsidian note / old .ref) item
 * - contentType: 'video' or 'page'
 *
 * Matrix:
 * |           | contentType: 'video' | contentType: 'page'  |
 * |-----------|----------------------|---------------------|
 * | isRef     | IframePlayer         | LivePageView        |
 * | !isRef    | VideoPlayer          | MarkdownPageView    |
 */
export function ContentViewer({ file, onClose }) {
  if (!file) {
    return null
  }

  // isReference flag (set by library:list for Obsidian reference notes)
  // Also support the legacy .ref extension for backward compatibility
  const isRef = file.isReference || file.name?.endsWith('.ref')
  const isMarkdown = file.name?.endsWith('.md')
  const contentType = file.contentType || 'video'

  // Referenced item — no local media, embed or live-fetch the remote URL
  if (isRef) {
    if (contentType === 'page') {
      // Referenced page: fetch and render live
      return <LivePageView url={file.url} onClose={onClose} />
    } else {
      // Referenced video: embed in iframe/webview
      return <IframePlayer url={file.url} onClose={onClose} />
    }
  }

  // Markdown file (.md) — render as markdown regardless of contentType
  if (isMarkdown) {
    return <MarkdownPageView videoUrl={file.videoUrl} onClose={onClose} />
  }

  // Downloaded item
  if (contentType === 'page') {
    // Downloaded page: render local .md file
    return <MarkdownPageView videoUrl={file.videoUrl} onClose={onClose} />
  } else {
    // Downloaded video: play local file
    return <VideoPlayer src={file.videoUrl} onClose={onClose} />
  }
}
