import type Konva from 'konva'

/** The on-screen stage is scaled/positioned to fit whatever room the window currently has
 *  (see LayoutStage.tsx), so a plain toDataURL() would only capture that shrunk viewport.
 *  Temporarily reset to the content's natural, untransformed size for the capture, then
 *  restore the on-screen fit afterward, so export quality is independent of window size. */
export function exportStageToDataUrl(stage: Konva.Stage, pixelRatio = 2): string {
  const prevScale = { x: stage.scaleX(), y: stage.scaleY() }
  const prevPosition = { x: stage.x(), y: stage.y() }
  const prevSize = { width: stage.width(), height: stage.height() }

  const bounds = stage.getClientRect({ skipTransform: true })
  stage.scale({ x: 1, y: 1 })
  stage.position({ x: -bounds.x, y: -bounds.y })
  stage.size({ width: bounds.width, height: bounds.height })
  stage.batchDraw()

  const dataUrl = stage.toDataURL({ pixelRatio })

  stage.scale(prevScale)
  stage.position(prevPosition)
  stage.size(prevSize)
  stage.batchDraw()

  return dataUrl
}
