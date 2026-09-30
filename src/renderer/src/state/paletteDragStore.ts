import { create } from 'zustand'
import type { NotePreset } from '@shared/constants/layoutNotes'

/** What a Layout palette item carries onto the canvas: the JSON in the drag's dataTransfer, which
 *  LayoutStage's drop handler reads. */
export interface PaletteDragPayload {
  label: string
  shape: 'rect' | 'circle'
  color: string
  /** Optional default placed size from the palette item (null/absent → addBlock's square default). */
  defaultWidth?: number | null
  defaultHeight?: number | null
  /** The palette item's default label color, copied onto the new block. null/absent → Auto. */
  labelColor?: string | null
  /** Set by the palette's Notes presets: drop a text note (opened for typing) instead of a block. */
  kind?: 'note'
  preset?: NotePreset
}

interface PaletteDragState {
  /** The palette item being dragged right now, or null. The browser only reveals a drag's data at
   *  the drop, so this is how the canvas knows what to preview while it's still on its way. */
  payload: PaletteDragPayload | null
  /** Where the drag started (client pixels), so the preview can show before the first dragover. */
  startPoint: { x: number; y: number } | null
  /** Whether a Layout canvas is drawing the preview itself right now. Off the canvas — over the
   *  palette, say — LayoutStage shows a floating copy under the cursor instead. */
  overCanvas: boolean
}

export const usePaletteDragStore = create<PaletteDragState>(() => ({ payload: null, startPoint: null, overCanvas: false }))

// A blank image to drag with, so the browser's own ghost of the sidebar card doesn't show — the
// canvas draws the real block under the cursor instead. Made at load so it's decoded before any
// drag starts (setDragImage ignores an image that isn't ready).
const BLANK_DRAG_IMAGE = typeof Image !== 'undefined' ? new Image() : null
if (BLANK_DRAG_IMAGE) BLANK_DRAG_IMAGE.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

/** The dragstart half of a palette drag: the data for the drop, the blank drag image, and the
 *  payload for the canvas preview. */
export function startPaletteDrag(e: React.DragEvent, payload: PaletteDragPayload): void {
  e.dataTransfer.setData('application/json', JSON.stringify(payload))
  e.dataTransfer.effectAllowed = 'copy'
  if (BLANK_DRAG_IMAGE) e.dataTransfer.setDragImage(BLANK_DRAG_IMAGE, 0, 0)
  usePaletteDragStore.setState({ payload, startPoint: { x: e.clientX, y: e.clientY }, overCanvas: false })
}

/** The dragend half: fires after a drop or a cancelled drag alike. */
export function endPaletteDrag(): void {
  usePaletteDragStore.setState({ payload: null, startPoint: null, overCanvas: false })
}
