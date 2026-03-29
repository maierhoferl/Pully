export function ContentTypeIcon({ type = 'video', size = 14, className = '' }) {
  const sizeClass = `w-${size} h-${size}`

  if (type === 'page') {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
      >
        {/* Document rectangle */}
        <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
        {/* Text lines */}
        <polyline points="9 7 15 7" />
        <polyline points="9 11 15 11" />
        <polyline points="9 15 13 15" />
      </svg>
    )
  }

  // video
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* Film frame rectangle with notches */}
      <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
      <line x1="7" y1="2" x2="7" y2="22" />
      <line x1="17" y1="2" x2="17" y2="22" />
      <line x1="5" y1="12" x2="5" y2="12.01" />
      <line x1="12" y1="12" x2="12" y2="12.01" />
      <line x1="19" y1="12" x2="19" y2="12.01" />
      {/* Play triangle */}
      <polygon points="10 7 10 17 16 12" />
    </svg>
  )
}
