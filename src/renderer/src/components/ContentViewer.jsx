import React from 'react'
import VideoPlayer from './VideoPlayer.jsx'
import { IframePlayer } from './IframePlayer.jsx'
import { MarkdownPageView } from './MarkdownPageView.jsx'
import { LivePageView } from './LivePageView.jsx'

/**
 * ContentViewer dispatches the right renderer based on:
 * - isRef: whether this is a referenced (.ref) item or downloaded
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

  const isRef = file.name?.endsWith('.ref')
  const isMarkdown = file.name?.endsWith('.md')
  const contentType = file.contentType || 'video'

  // Referenced item (.ref file)
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
