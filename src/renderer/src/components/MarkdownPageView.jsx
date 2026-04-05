import React, { useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/** Strip YAML frontmatter block (--- ... ---) from an Obsidian note before rendering. */
function stripFrontmatter(content) {
  if (!content || !content.startsWith('---\n')) return content
  const end = content.indexOf('\n---\n', 4)
  if (end === -1) return content
  return content.slice(end + 5)
}

/**
 * MarkdownPageView renders a markdown file (.md) with base64-embedded images.
 * Fetches the content via pully:// protocol from the library folder.
 * Strips Obsidian YAML frontmatter automatically before rendering.
 */
export function MarkdownPageView({ videoUrl, onClose }) {
  const [content, setContent] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function fetchMarkdown() {
      if (!videoUrl) {
        setError('No file URL provided')
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        setError(null)

        // Convert pully:// URL to file path
        // pully://... or pully:///... → remove protocol
        const filePath = videoUrl
          .replace(/^pully:\/\/\//, '/')  // Handle pully:///path
          .replace(/^pully:\/\//, '/')    // Handle pully://path

        // Read file via IPC
        const result = await window.api.readFile(filePath)
        if (result.error) {
          throw new Error(result.error)
        }

        setContent(stripFrontmatter(result.content))
      } catch (err) {
        console.error('Failed to fetch markdown:', err)
        setError(`Failed to load page content: ${err.message}`)
      } finally {
        setLoading(false)
      }
    }

    fetchMarkdown()
  }, [videoUrl])

  if (loading) {
    return (
      <div className="w-full bg-gray-800 rounded-lg flex items-center justify-center h-96 text-gray-400">
        <div className="flex flex-col items-center gap-2">
          <div className="animate-spin">⟳</div>
          <p>Loading page content…</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="w-full bg-gray-800 rounded-lg flex flex-col items-center justify-center h-96 text-gray-400 p-4">
        <p className="text-red-400">{error}</p>
        {onClose && (
          <button
            onClick={onClose}
            className="mt-4 text-xs font-semibold px-2.5 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-white transition-colors"
          >
            ← Back
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="w-full flex flex-col gap-4">
      {content && (
        <div className="prose prose-invert max-w-none prose-sm bg-gray-800 rounded-lg p-4 text-gray-100 overflow-auto max-h-96">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              h1: ({ node, ...props }) => (
                <h1 className="text-2xl font-bold mt-4 mb-2" {...props} />
              ),
              h2: ({ node, ...props }) => <h2 className="text-xl font-bold mt-3 mb-2" {...props} />,
              h3: ({ node, ...props }) => (
                <h3 className="text-lg font-semibold mt-2 mb-2" {...props} />
              ),
              p: ({ node, ...props }) => <p className="mb-3 leading-relaxed" {...props} />,
              ul: ({ node, ...props }) => <ul className="mb-3 ml-4 list-disc" {...props} />,
              ol: ({ node, ...props }) => <ol className="mb-3 ml-4 list-decimal" {...props} />,
              li: ({ node, ...props }) => <li className="mb-1" {...props} />,
              blockquote: ({ node, ...props }) => (
                <blockquote
                  className="border-l-4 border-gray-600 pl-3 italic text-gray-400 mb-3"
                  {...props}
                />
              ),
              code: ({ node, inline, ...props }) =>
                inline ? (
                  <code
                    className="bg-gray-900 px-1.5 py-0.5 rounded text-sm font-mono text-gray-200"
                    {...props}
                  />
                ) : (
                  <code
                    className="bg-gray-900 p-2 rounded block text-sm font-mono text-gray-200 overflow-auto mb-3"
                    {...props}
                  />
                ),
              img: ({ node, ...props }) => (
                <img className="max-w-full h-auto rounded my-3" {...props} />
              ),
              a: ({ node, ...props }) => (
                <a className="text-blue-400 hover:text-blue-300 underline" {...props} />
              )
            }}
          >
            {content}
          </ReactMarkdown>
        </div>
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
