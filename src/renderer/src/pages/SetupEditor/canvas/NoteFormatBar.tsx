import { forwardRef, useLayoutEffect, useRef, useState } from 'react'
import type { RoomLayoutBlockDraft } from '@shared/types/setup'
import type { BlockPatch } from '@renderer/state/layoutStore'
import SwatchPicker from '@renderer/components/SwatchPicker'
import TextColorPicker from '@renderer/components/TextColorPicker'
import {
  hasNoteFill,
  NOTE_DEFAULT_FONT_SIZE,
  NOTE_FONT_SIZES,
  NOTE_NO_FILL,
  noteBackdrop,
  stepNoteFontSize
} from '@shared/constants/layoutNotes'

interface Props {
  note: RoomLayoutBlockDraft
  /** The note's bounding box in container pixels (see noteScreenGeometry). */
  box: { left: number; top: number; right: number; bottom: number }
  containerWidth: number
  editing: boolean
  onPatch: (patch: BlockPatch) => void
  onEdit: () => void
  onDone: () => void
}

const GAP = 8
const EDGE = 4

/** The small toolbar that floats over a Layout Mode note while it is the only thing selected, or
 *  while it is being typed: text size, bold, fill, text color, and Done (or Edit text).
 *
 *  Every control swallows mousedown's default, so clicking one doesn't take focus from the note
 *  editor — the caret stays put and the next keystroke still types. Changes made while typing are
 *  folded into that typing session's single undo step; changes to a selected note that isn't being
 *  typed are one step each (the caller routes them — see LayoutStage). */
const NoteFormatBar = forwardRef<HTMLDivElement, Props>(function NoteFormatBar(
  { note, box, containerWidth, editing, onPatch, onEdit, onDone },
  ref
) {
  const localRef = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useLayoutEffect(() => {
    const el = localRef.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    if (width !== size.width || height !== size.height) setSize({ width, height })
  })

  const fontSize = note.fontSize ?? NOTE_DEFAULT_FONT_SIZE
  // Above the note when there's room, otherwise below it; never past the canvas's left/right edge.
  const above = box.top - size.height - GAP
  const top = above >= EDGE ? above : box.bottom + GAP
  const left = Math.max(EDGE, Math.min(box.left, containerWidth - size.width - EDGE))
  const keepFocus = (e: React.MouseEvent): void => e.preventDefault()

  return (
    <div
      ref={(el) => {
        localRef.current = el
        if (typeof ref === 'function') ref(el)
        else if (ref) ref.current = el
      }}
      role="toolbar"
      aria-label="Note format"
      className="picker-menu layout-note-format-bar"
      style={{ top, left, visibility: size.width ? 'visible' : 'hidden' }}
      onMouseDown={keepFocus}
    >
      <button
        type="button"
        className="btn small"
        aria-label="Smaller text"
        title="Smaller text"
        disabled={fontSize <= NOTE_FONT_SIZES[0]}
        onClick={() => onPatch({ fontSize: stepNoteFontSize(fontSize, -1) })}
      >
        A−
      </button>
      <span className="layout-note-format-size" aria-label={`Text size ${fontSize}`}>
        {fontSize}
      </span>
      <button
        type="button"
        className="btn small"
        aria-label="Larger text"
        title="Larger text"
        disabled={fontSize >= NOTE_FONT_SIZES[NOTE_FONT_SIZES.length - 1]}
        onClick={() => onPatch({ fontSize: stepNoteFontSize(fontSize, 1) })}
      >
        A+
      </button>
      <button
        type="button"
        className="btn small"
        aria-label="Bold"
        title="Bold"
        aria-pressed={note.fontBold}
        style={{ fontWeight: 700 }}
        onClick={() => onPatch({ fontBold: !note.fontBold })}
      >
        B
      </button>
      <span className="layout-note-format-divider" aria-hidden="true" />
      <span className="layout-note-format-label">Fill</span>
      <SwatchPicker
        value={hasNoteFill(note.color) ? note.color : null}
        onChange={(color) => onPatch({ color: color ?? NOTE_NO_FILL })}
        allowNone
        noneLabel="None"
        emptyLabel="None"
        title="Note fill"
      />
      <span className="layout-note-format-label">Text</span>
      <TextColorPicker
        value={note.labelColor}
        onChange={(labelColor) => onPatch({ labelColor })}
        fill={noteBackdrop(note.color)}
        title="Note text color"
      />
      <span className="layout-note-format-divider" aria-hidden="true" />
      {editing ? (
        <button type="button" className="btn small primary" onClick={onDone}>
          Done
        </button>
      ) : (
        <button type="button" className="btn small" onClick={onEdit}>
          Edit text
        </button>
      )}
    </div>
  )
})

export default NoteFormatBar
