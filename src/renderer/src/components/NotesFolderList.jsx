// src/renderer/src/components/NotesFolderList.jsx
export default function NotesFolderList({ folders, activeFolder, onSelect }) {
  return (
    <div className="flex flex-col gap-0.5 p-2">
      {[null, ...folders].map(folder => (
        <button
          key={folder ?? '__root__'}
          onClick={() => onSelect(folder)}
          className={`text-left text-sm px-3 py-1.5 rounded truncate transition-colors ${
            activeFolder === folder
              ? 'bg-gray-600 text-white'
              : 'text-gray-400 hover:bg-gray-700 hover:text-white'
          }`}
        >
          {folder ?? '(Library)'}
        </button>
      ))}
    </div>
  )
}
