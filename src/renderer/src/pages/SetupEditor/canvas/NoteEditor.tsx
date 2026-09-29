import { useEffect, useLayoutEffect, useRef } from 'react'
import type { RoomLayoutBlockDraft } from '@shared/types/setup'
import {
  hasNoteFill,
  NOTE_DEFAULT_FONT_SIZE,
  NOTE_FONT_FAMILY,
  NOTE_LINE_HEIGHT,
  NOTE_PADDING,
  resolveNoteTextColor
} from '@shared/constants/layoutNotes'

/** How the stage maps room pixels onto the container: screen = offset + room × scale. */
export interface StageView {
  scale: number
  x: number
  y: number
}

/** The note's top-left corner and axis-aligned bounding box in container pixels. The editor is
 *  pinned by its top-left corner (so it grows downward as lines are added, like the note does
 *  once committed); the format bar sits against the bounding box. */
export function noteScreenGeometry(
  note: Pick<RoomLayoutBlockDraft, 'x' | 'y' | 'width' | 'height' | 'rotation'>,
  view: StageView
): { topLeft: { x: number; y: number }; box: { left: number; top: number; right: number; bottom: number } } {
  const rad = (note.rotation * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const corner = (dx: number, dy: number): { x: number; y: number } => ({
    x: view.x + (note.x + dx * cos - dy * sin) * view.scale,
    y: view.y + (note.y + dx * sin + dy * cos) * view.scale
  })
  const hw = note.width / 2
  const hh = note.height / 2
  const corners = [corner(-hw, -hh), corner(hw, -hh), corner(-hw, hh), corner(hw, hh)]
  const xs = corners.map((c) => c.x)
  const ys = corners.map((c) => c.y)
  return {
    topLeft: corners[0],
    box: { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) }
  }
}

interface Props {
  draft: RoomLayoutBlockDraft
  view: StageView
  onChange: (text: string) => void
  onCommit: () => void
  /** Elements that are part of the editing session — the format bar, and any swatch popover it
   *  opens (found by class, since those are portaled to <body>). Pressing inside them does not
   *  end the edit. */
  barRef: React.RefObject<HTMLElement | null>
}

/** The in-place text editor for a Layout Mode note: a textarea laid exactly over the note, drawn
 *  in the note's own font, fill and color at the current zoom, so typing looks like writing on the
 *  plan. The canvas copy of the note is hidden meanwhile (LayoutNote's `editing`).
 *
 *  Enter is a new line. Esc, Cmd/Ctrl+Enter, the Done button, or pressing anywhere outside the
 *  editor and its format bar ends the edit (the store's commitNoteEdit). Blur alone deliberately
 *  does not: switching to another app, or clicking into a color popover, must not cut an edit
 *  short.
 *
 *  Being a textarea is also what keeps typing from reaching the canvas shortcuts — the arrow-nudge
 *  and Space-pan listener in LayoutStage and the keybind dispatcher both ignore key presses that
 *  start in a text field. */
export default function NoteEditor({ draft, view, onChange, onCommit, barRef }: Props): JSX.Element {
  const ref = useRef<HTMLTextAreaElement>(null)
  const fontSize = (draft.fontSize ?? NOTE_DEFAULT_FONT_SIZE) * view.scale
  const { topLeft } = noteScreenGeometry(draft, view)

  // Focus once, with the caret at the end — double-clicking a note to add a line is the common case.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [])

  // Back into the text after a format change, so picking a fill doesn't strand the caret.
  useEffect(() => {
    ref.current?.focus()
  }, [draft.color, draft.labelColor, draft.fontSize, draft.fontBold])

  // Grow with the text. Reset first so it can also shrink when lines are deleted.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [draft.label, fontSize, draft.width, view.scale, draft.fontBold])

  useEffect(() => {
    function onPointerDown(e: MouseEvent): void {
      const target = e.target as HTMLElement | null
      if (!target) return
      if (ref.current?.contains(target) || barRef.current?.contains(target) || target.closest('.picker-menu')) return
      onCommit()
    }
    // Capture phase, so the edit is written before whatever the press goes on to do — selecting
    // another block, starting a drag, opening a menu.
    document.addEventListener('mousedown', onPointerDown, true)
    return () => document.removeEventListener('mousedown', onPointerDown, true)
  }, [onCommit, barRef])

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
      e.preventDefault()
      e.stopPropagation()
      onCommit()
    }
  }

  return (
    <textarea
      ref={ref}
      aria-label="Note text"
      value={draft.label}
      placeholder="Type a note"
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={handleKeyDown}
      spellCheck
      rows={1}
      className="layout-note-editor"
      style={{
        left: topLeft.x,
        top: topLeft.y,
        width: draft.width * view.scale,
        transform: `rotate(${draft.rotation}deg)`,
        padding: NOTE_PADDING * view.scale,
        fontFamily: NOTE_FONT_FAMILY,
        fontSize,
        fontWeight: draft.fontBold ? 'bold' : 'normal',
        lineHeight: NOTE_LINE_HEIGHT,
        color: resolveNoteTextColor(draft.color, draft.labelColor),
        background: hasNoteFill(draft.color) ? draft.color : 'transparent'
      }}
    />
  )
}
