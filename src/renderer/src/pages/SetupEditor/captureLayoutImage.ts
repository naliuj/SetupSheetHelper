import type Konva from 'konva'
import { exportStageToDataUrl } from './canvas/konvaExport'
import { LAYOUT_EXPORT_PIXEL_RATIO } from '@shared/constants/roomLayout'

/** Three outcomes, not two, because the callers have to tell "there is no layout" from "there is
 *  one but we could not get at it" — they say different things to the user, and only the second is
 *  worth retrying. That distinction used to live in a `dataUrl` plus a separate boolean. */
export type LayoutCaptureResult =
  | { status: 'ok'; dataUrl: string }
  | { status: 'none' }
  | { status: 'unreachable' }

interface Options {
  setupId: number
  studioId: number | null
  /** The local stage, when Layout Mode is rendered in this window. Null when it is popped out. */
  stage: Konva.Stage | null
  monochrome: boolean
  /** Clears the block selection before flattening, so the resize handles are not baked in. */
  deselect: () => void
}

/** Flattens the room layout to a PNG data URL, from wherever it currently lives.
 *
 *  Shared by the PDF and spreadsheet exports rather than copied into each. The layout stage stays
 *  mounted (just hidden) even in Table Mode, so capturing no longer means switching modes — but it
 *  can still be genuinely empty when the setup has no effective layout at all, and there is no
 *  local stage whatsoever when Layout Mode is popped out into its own window. */
export async function captureLayoutImage({
  setupId,
  studioId,
  stage,
  monochrome,
  deselect
}: Options): Promise<LayoutCaptureResult> {
  const layout = studioId ? await window.api.layoutFile.getEffectiveForSetup(setupId, studioId) : null
  if (!layout) return { status: 'none' }

  if (stage) {
    deselect()
    // Let the deselect re-render (which hides the resize/rotate handles) before flattening.
    await new Promise((resolve) => setTimeout(resolve, 30))
    return { status: 'ok', dataUrl: exportStageToDataUrl(stage, LAYOUT_EXPORT_PIXEL_RATIO, monochrome) }
  }

  // Popped out: ask the standalone Layout window to render its own live stage and send back the
  // PNG (see main/layoutWindow.ts's requestExportImage relay). A null reply means it did not
  // respond in time — closed mid-request, or hung — rather than "no layout exists", which is why
  // that case is its own status.
  const dataUrl = await window.api.layoutWindow.requestExportImage(setupId, LAYOUT_EXPORT_PIXEL_RATIO, monochrome)
  return dataUrl ? { status: 'ok', dataUrl } : { status: 'unreachable' }
}
