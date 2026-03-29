# Browser Tab Media Entry Redesign

**Date:** 2026-03-29
**Status:** Approved
**Scope:** Relayout MediaEntry component in SidePanel for improved visual hierarchy and consistency

## Overview

Redesign the Media Entry layout in the Browser tab's side panel to be more compact, visually scannable, and consistent with the Library tab's styling. Current layout is horizontal with all elements in one row. New layout uses a vertical structure with improved information hierarchy and reduced visual clutter.

## Current State

The `MediaEntry` component (`src/renderer/src/components/MediaPanel.jsx`) currently displays:
- Title (truncated text)
- Quality selector dropdown (inline, limited space)
- Remember button (gray)
- Download button (blue)
- Thumbnail (96x56px, left-aligned)

All elements are in a single horizontal row with flex layout. This creates a cramped appearance and makes the buttons less discoverable.

## Design

### Layout Structure

Each media entry consists of three sections:

1. **Header** (Title line only)
   - Large, bold title text (0.875rem, font-medium, white)
   - No icon, no metadata here

2. **Metadata line** (below title, same width)
   - Left: Video type indicator in small gray text (0.65rem)
     - "Single video" for single items
     - "Playlist containing X videos" for playlist entries
   - Right: Quality selector dropdown (no label, inline)
     - Font: 0.7rem
     - Background: gray-700 (#374151)
     - Border: gray-600 (#4b5563)
   - Gap between type indicator and selector: 1rem (flex spacer)

3. **Action section** (below metadata, horizontal layout)
   - Thumbnail: 96px wide × 56px tall, rounded corners, left-aligned
   - Button column (right of thumbnail, vertical stack):
     - Remember button: green background (#16a34a), positioned above Download
     - Download button: blue background (#2563eb), positioned below Remember
     - Button size: small (0.75rem font, 0.25rem × 0.5rem padding)
     - Icons: 💾 for Remember, ⬇ for Download
     - Gap between buttons: 0.375rem

### Container Styling

Each entry is wrapped in a container matching the Library tab's file items:

- **Border:** 1px solid `border-gray-700` (#374151)
- **Border Radius:** `rounded-lg` (0.5rem)
- **Background:**
  - Default: `bg-gray-800` (#1f2937)
  - Hover: `bg-gray-900` (#111827)
- **Padding:** `px-3 py-2` (0.75rem)
- **Transition:** Smooth 0.2s transition on background color on hover
- **Container Gap:** 1.5rem between entries

### Typography & Colors

| Element | Size | Weight | Color | Notes |
|---------|------|--------|-------|-------|
| Title | 0.875rem | font-medium | white | Truncate if too long |
| Type indicator | 0.65rem | normal | gray-400 | Right-aligned space |
| Quality selector | 0.7rem | normal | gray-300 bg | Accessible dropdown |
| Remember button | 0.75rem | font-semibold | white on #16a34a | Green, always visible |
| Download button | 0.75rem | font-semibold | white on #2563eb | Blue, always visible |

### Information Hierarchy

1. **Title** — most prominent (large, white, bold)
2. **Type + Quality** — secondary metadata (small gray, right-aligned)
3. **Actions** — thumbnail + two buttons
4. **Visual separation** — border box, hover effect

## Data Requirements

### From yt-dlp extraction results

- `entry.title` → Title (required)
- Playlist detection → Determine if entry is single video or playlist
  - Display "Single video" for single videos
  - Display "Playlist" or "Playlist (N videos)" for playlists (implementation to determine best approach)
  - Inspect `entry` properties to detect (e.g., `_type === 'playlist'`, or presence of playlist-specific fields)
- `entry.formats` → Array of available quality options (existing)
- `entry.thumbnail` → Image URL for thumbnail (existing)

### Current state handling

- Remember button states: idle, pending, done, exists, error (existing)
- Download button states: not started, queued, downloading (%), done, failed (existing)
- Quality dropdown: highest to lowest resolution, user-selectable (existing)

## Implementation Notes

### Files to modify

- **`src/renderer/src/components/MediaPanel.jsx`** — Update `MediaEntry` component
  - Keep `DownloadButton` subcomponent as-is
  - Restructure JSX layout from horizontal flex to vertical stacking
  - Move quality selector to header metadata line
  - Add type indicator logic
  - Apply new container classes

### Styling approach

- Use Tailwind classes to match Library styling: `bg-gray-800 hover:bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 transition-colors`
- Button styling: keep existing colors, adjust size/padding for compact layout
- Thumbnail: keep 96×56, just reposition in new layout

### Backwards compatibility

- No changes to data structures or API contracts
- No changes to `DownloadButton` or state management logic
- Pure layout refactor

### Testing scope

- Renderer tests in `tests/renderer/` should still pass (component contract unchanged)
- Visual testing: single video, playlist, various format counts, button states
- Responsive behavior: ensure tight layout doesn't break on smaller widths

## Success Criteria

✓ Compact vertical layout reduces visual clutter
✓ Type indicator clearly shows single vs. playlist
✓ Quality selector is accessible without separate label
✓ Buttons are small but clearly actionable (green Remember, blue Download)
✓ Hover effect matches Library tab styling
✓ All existing functionality preserved (remember, download, quality selection, status tracking)
✓ Visual consistency with Library tab border/padding/colors
