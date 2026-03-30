import React from 'react'

export default function FolderImportDialog({ folderPath, fileCount, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md shadow-lg">
        <h2 className="text-lg font-semibold mb-2 text-gray-900">Import Folder?</h2>
        <p className="text-gray-600 mb-4">
          This folder contains <strong>{fileCount} files</strong>. Processing may take a moment.
        </p>
        <div className="flex gap-4">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 transition-colors text-gray-900"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          >
            Proceed
          </button>
        </div>
      </div>
    </div>
  )
}
