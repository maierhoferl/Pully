import React from 'react'

function toEmbedUrl(url) {
  if (!url) return null

  // YouTube
  const youtubeMatch = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  )
  if (youtubeMatch) {
    return `https://www.youtube.com/embed/${youtubeMatch[1]}`
  }

  // Vimeo
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/)
  if (vimeoMatch) {
    return `https://player.vimeo.com/video/${vimeoMatch[1]}`
  }

  // Others: return original URL and use webview
  return url
}

/**
 * IframePlayer embeds video content in iframe or webview
 * - YouTube/Vimeo → <iframe> with embed URL
 * - Other URLs → <webview> with original URL
 */
export function IframePlayer({ url, onClose }) {
  const embedUrl = toEmbedUrl(url)

  if (!embedUrl) {
    return (
      <div className="w-full bg-gray-800 rounded-lg flex flex-col items-center justify-center h-96 text-gray-400">
        <p>No URL available</p>
        {onClose && (
          <button
            onClick={onClose}
            className="mt-2 text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded"
          >
            Back
          </button>
        )}
      </div>
    )
  }

  // Check if this is an embed URL (YouTube or Vimeo)
  const isEmbedUrl =
    embedUrl.includes('youtube.com/embed') || embedUrl.includes('player.vimeo.com')

  return (
    <div className="w-full flex flex-col gap-2">
      {isEmbedUrl ? (
        <iframe
          src={embedUrl}
          title="Embedded Video"
          className="w-full rounded-lg shadow"
          style={{ aspectRatio: '16 / 9', minHeight: '400px' }}
          allowFullScreen
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        />
      ) : (
        <webview
          src={embedUrl}
          className="w-full rounded-lg shadow"
          style={{ aspectRatio: '16 / 9', minHeight: '400px' }}
        />
      )}

      {onClose && (
        <button
          onClick={onClose}
          className="self-start text-xs font-semibold px-2.5 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-white transition-colors"
        >
          ← Back
        </button>
      )}
    </div>
  )
}
