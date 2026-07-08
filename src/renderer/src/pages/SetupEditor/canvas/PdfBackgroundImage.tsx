import { useEffect, useState } from 'react'
import { Image as KonvaImage } from 'react-konva'
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

const RENDER_SCALE = 2

interface Props {
  studioId: number
  onSize: (width: number, height: number) => void
}

export default function PdfBackgroundImage({ studioId, onSize }: Props): JSX.Element | null {
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null)

  useEffect(() => {
    let cancelled = false
    setCanvas(null)

    async function render(): Promise<void> {
      const layout = await window.api.layoutPdf.getForStudio(studioId)
      if (!layout || cancelled) return

      // "app-file" is a registered "standard" scheme (like http), which requires a non-empty
      // host — a bare `app-file:///Users/...` gets misparsed as host "Users" with the rest of
      // the path silently dropped. Route the real absolute path through a single opaque,
      // percent-encoded path segment behind a fixed placeholder host instead (matched by the
      // protocol.handle in src/main/index.ts).
      const url = `app-file://local-file/${encodeURIComponent(layout.filePath)}`
      const doc = await pdfjsLib.getDocument(url).promise
      const page = await doc.getPage(1)
      const viewport = page.getViewport({ scale: RENDER_SCALE })

      const offscreen = document.createElement('canvas')
      offscreen.width = viewport.width
      offscreen.height = viewport.height
      const ctx = offscreen.getContext('2d')
      if (!ctx) return

      await page.render({ canvasContext: ctx, viewport }).promise
      if (cancelled) return

      setCanvas(offscreen)
      onSize(viewport.width, viewport.height)
    }

    render().catch((err) => console.error('Failed to render layout PDF', err))

    return () => {
      cancelled = true
    }
  }, [studioId])

  if (!canvas) return null
  return <KonvaImage image={canvas} x={0} y={0} listening={false} />
}
