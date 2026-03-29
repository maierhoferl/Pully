import { useState, useRef, useEffect, useCallback } from 'react'

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2]

function fmt(secs) {
  if (!isFinite(secs)) return '0:00'
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

export default function VideoPlayer({ src, onClose }) {
  const videoRef = useRef(null)
  const containerRef = useRef(null)
  const hideTimer = useRef(null)

  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [showControls, setShowControls] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isPip, setIsPip] = useState(false)
  const [error, setError] = useState(null)
  const [showSpeedMenu, setShowSpeedMenu] = useState(false)
  const pipSupported = typeof document !== 'undefined' && !!document.pictureInPictureEnabled

  // Auto-start on mount
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    v.play().catch(() => {})
  }, [src])

  // Reset state when src changes
  useEffect(() => {
    setPlaying(false)
    setCurrentTime(0)
    setDuration(0)
    setError(null)
    setShowSpeedMenu(false)
  }, [src])

  const resetHideTimer = useCallback(() => {
    setShowControls(true)
    clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) setShowControls(false)
    }, 2000)
  }, [])

  useEffect(() => () => clearTimeout(hideTimer.current), [])

  // Video event listeners
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const onPlay = () => { setPlaying(true); resetHideTimer() }
    const onPause = () => { setPlaying(false); setShowControls(true); clearTimeout(hideTimer.current) }
    const onTimeUpdate = () => setCurrentTime(v.currentTime)
    const onDurationChange = () => setDuration(v.duration)
    const onVolumeChange = () => { setVolume(v.volume); setMuted(v.muted) }
    const onRateChange = () => setPlaybackRate(v.playbackRate)
    const onError = () => {
      const err = v.error
      const meta = err ? { code: err.code, message: err.message, src } : { src }
      window.api.logError?.('video-player', `Video playback failed: ${src}`, meta)
      setError('Could not play this file.')
    }
    const onEnded = () => { setPlaying(false); setShowControls(true); clearTimeout(hideTimer.current) }
    v.addEventListener('play', onPlay)
    v.addEventListener('pause', onPause)
    v.addEventListener('timeupdate', onTimeUpdate)
    v.addEventListener('durationchange', onDurationChange)
    v.addEventListener('volumechange', onVolumeChange)
    v.addEventListener('ratechange', onRateChange)
    v.addEventListener('error', onError)
    v.addEventListener('ended', onEnded)
    return () => {
      v.removeEventListener('play', onPlay)
      v.removeEventListener('pause', onPause)
      v.removeEventListener('timeupdate', onTimeUpdate)
      v.removeEventListener('durationchange', onDurationChange)
      v.removeEventListener('volumechange', onVolumeChange)
      v.removeEventListener('ratechange', onRateChange)
      v.removeEventListener('error', onError)
      v.removeEventListener('ended', onEnded)
    }
  }, [resetHideTimer])

  // Fullscreen sync
  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  // PiP sync
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const onEnterPip = () => setIsPip(true)
    const onLeavePip = () => setIsPip(false)
    v.addEventListener('enterpictureinpicture', onEnterPip)
    v.addEventListener('leavepictureinpicture', onLeavePip)
    return () => {
      v.removeEventListener('enterpictureinpicture', onEnterPip)
      v.removeEventListener('leavepictureinpicture', onLeavePip)
    }
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e) => {
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (!containerRef.current?.contains(document.activeElement) && document.activeElement !== document.body) return
      const v = videoRef.current
      if (!v) return
      if (e.code === 'Space') { e.preventDefault(); playing ? v.pause() : v.play() }
      else if (e.code === 'ArrowLeft') { e.preventDefault(); v.currentTime = Math.max(0, v.currentTime - 5) }
      else if (e.code === 'ArrowRight') { e.preventDefault(); v.currentTime = Math.min(v.duration, v.currentTime + 5) }
      else if (e.key === 'f') toggleFullscreen()
      else if (e.key === 'm') { v.muted = !v.muted }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [playing])

  const togglePlay = () => {
    const v = videoRef.current
    if (!v) return
    playing ? v.pause() : v.play()
  }

  const handleScrub = (e) => {
    const v = videoRef.current
    if (!v) return
    v.currentTime = Number(e.target.value)
    setCurrentTime(Number(e.target.value))
  }

  const handleVolume = (e) => {
    const v = videoRef.current
    if (!v) return
    v.volume = Number(e.target.value)
    v.muted = false
  }

  const toggleMute = () => {
    const v = videoRef.current
    if (!v) return
    v.muted = !v.muted
  }

  const setSpeed = (rate) => {
    const v = videoRef.current
    if (!v) return
    v.playbackRate = rate
    setShowSpeedMenu(false)
  }

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen()
    } else {
      document.exitFullscreen()
    }
  }

  const togglePip = async () => {
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture()
      } else {
        await videoRef.current?.requestPictureInPicture()
      }
    } catch {
      // PiP not available or user denied
    }
  }

  const handleOpenSystemPlayer = () => {
    // pully:///path/to/file -> /path/to/file
    const filePath = src.startsWith('pully://') ? src.replace('pully://', '') : src
    window.api.playFile(filePath)
  }

  if (error) {
    return (
      <div className="w-full aspect-video bg-gray-800 rounded flex flex-col items-center justify-center gap-3">
        <p className="text-sm text-gray-400">{error}</p>
        <div className="flex gap-2">
          <button
            onClick={handleOpenSystemPlayer}
            className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded transition-colors"
          >
            Open in System Player
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="text-xs bg-gray-700 hover:bg-gray-600 text-white px-3 py-1.5 rounded transition-colors"
            >
              Back
            </button>
          )}
        </div>
      </div>
    )
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div
      ref={containerRef}
      className="relative w-full aspect-video bg-black rounded overflow-hidden group"
      onMouseMove={resetHideTimer}
      onMouseLeave={() => { if (playing) setShowControls(false) }}
    >
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        ref={videoRef}
        src={src}
        className="w-full h-full object-contain"
        onClick={togglePlay}
      />

      {/* Controls overlay */}
      <div
        className={`absolute inset-0 flex flex-col justify-end transition-opacity duration-200 ${showControls ? 'opacity-100' : 'opacity-0'}`}
        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 40%)' }}
      >
        {/* Scrubber */}
        <div className="px-3 pt-2">
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={currentTime}
            onChange={handleScrub}
            className="w-full h-1 accent-indigo-500 cursor-pointer"
          />
        </div>

        {/* Bottom controls row */}
        <div className="flex items-center gap-2 px-3 pb-2.5 pt-1">
          {/* Play/Pause */}
          <button onClick={togglePlay} className="text-white hover:text-indigo-300 transition-colors w-6 text-center">
            {playing ? '⏸' : '▶'}
          </button>

          {/* Volume */}
          <button onClick={toggleMute} className="text-white hover:text-indigo-300 transition-colors w-5 text-center text-xs">
            {muted || volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊'}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={muted ? 0 : volume}
            onChange={handleVolume}
            className="w-16 h-1 accent-indigo-500 cursor-pointer"
          />

          {/* Time */}
          <span className="text-xs text-gray-300 tabular-nums ml-1">
            {fmt(currentTime)} / {fmt(duration)}
          </span>

          <div className="flex-1" />

          {/* Speed */}
          <div className="relative">
            <button
              onClick={() => setShowSpeedMenu(p => !p)}
              className="text-xs text-gray-300 hover:text-white transition-colors px-1.5 py-0.5 rounded bg-gray-700/60 hover:bg-gray-600/80 tabular-nums"
            >
              {playbackRate}×
            </button>
            {showSpeedMenu && (
              <div className="absolute bottom-full right-0 mb-1 bg-gray-800 border border-gray-600 rounded shadow-lg overflow-hidden">
                {SPEEDS.map(s => (
                  <button
                    key={s}
                    onClick={() => setSpeed(s)}
                    className={`block w-full text-right px-3 py-1 text-xs hover:bg-gray-700 transition-colors ${s === playbackRate ? 'text-indigo-400 font-semibold' : 'text-gray-300'}`}
                  >
                    {s}×
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* PiP */}
          {pipSupported && (
            <button
              onClick={togglePip}
              title="Picture in Picture"
              className={`text-xs transition-colors ${isPip ? 'text-indigo-400' : 'text-gray-300 hover:text-white'}`}
            >
              ⧉
            </button>
          )}

          {/* Fullscreen */}
          <button
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            className="text-gray-300 hover:text-white transition-colors text-xs"
          >
            {isFullscreen ? '⊡' : '⛶'}
          </button>

          {/* Close / back to thumbnail */}
          {onClose && (
            <button
              onClick={onClose}
              title="Back to thumbnail"
              className="text-gray-300 hover:text-white transition-colors text-xs ml-1"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Speed menu backdrop */}
      {showSpeedMenu && (
        <div className="fixed inset-0 z-10" onClick={() => setShowSpeedMenu(false)} />
      )}
    </div>
  )
}
