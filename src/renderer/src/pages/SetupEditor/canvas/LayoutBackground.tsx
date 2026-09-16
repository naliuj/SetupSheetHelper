import { useEffect, useState } from 'react'
import { Image as KonvaImage, Rect } from 'react-konva'
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url'
import { BLANK_SHEET_WIDTH_PX, BLANK_SHEET_HEIGHT_PX } from '@shared/constants/roomLayout'
import { useLayoutStoreState } from '@renderer/state/layoutStoreContext'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

const RENDER_SCALE = 2

/** The page edge. Without it the sheet has none: it is white, and in light mode the stage around
 *  it is near-white too (1.22:1), so the canvas reads as an infinite white void rather than a
 *  piece of paper on a desk. A soft drop shadow rather than a stroke, because it has to work on
 *  the dark stage as well, where a gray outline would look like part of the drawing. Applied to
 *  the imported floor plans too, which are white sheets with the same problem. */
const PAPER_SHADOW = {
  shadowColor: '#000000',
  shadowBlur: 18,
  shadowOpacity: 0.28,
  shadowOffsetY: 2
} as const

interface Props {
  studioId: number
  setupId: number | null
  onSize: (width: number, height: number) => void
}

async function renderPdf(url: string): Promise<{ image: HTMLCanvasElement; width: number; height: number }> {
  const doc = await pdfjsLib.getDocument(url).promise
  const page = await doc.getPage(1)
  const viewport = page.getViewport({ scale: RENDER_SCALE })

  const offscreen = document.createElement('canvas')
  offscreen.width = viewport.width
  offscreen.height = viewport.height
  const ctx = offscreen.getContext('2d')
  if (!ctx) throw new Error('Failed to get 2D context for layout PDF render')

  await page.render({ canvasContext: ctx, viewport }).promise
  return { image: offscreen, width: viewport.width, height: viewport.height }
}

function loadImage(url: string): Promise<{ image: HTMLImageElement; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ image: img, width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => reject(new Error('Failed to load layout image'))
    img.src = url
  })
}

export default function LayoutBackground({ studioId, setupId, onSize }: Props): JSX.Element | null {
  const [image, setImage] = useState<HTMLCanvasElement | HTMLImageElement | null>(null)
  const [blank, setBlank] = useState(false)
  const layoutBackgroundVersion = useLayoutStoreState((s) => s.layoutBackgroundVersion)

  useEffect(() => {
    let cancelled = false
    setImage(null)
    setBlank(false)

    async function render(): Promise<void> {
      const effective = await window.api.layoutFile.getEffectiveForSetup(setupId, studioId)
      if (!effective || cancelled) return

      if (effective.kind === 'blank') {
        setBlank(true)
        onSize(BLANK_SHEET_WIDTH_PX, BLANK_SHEET_HEIGHT_PX)
        return
      }

      // "app-file" is a registered "standard" scheme (like http), which requires a non-empty
      // host — a bare `app-file:///Users/...` gets misparsed as host "Users" with the rest of
      // the path silently dropped. Route the real absolute path through a single opaque,
      // percent-encoded path segment behind a fixed placeholder host instead (matched by the
      // protocol.handle in src/main/index.ts).
      const url = `app-file://local-file/${encodeURIComponent(effective.filePath)}`
      const isPdf = effective.filePath.toLowerCase().endsWith('.pdf')
      const result = isPdf ? await renderPdf(url) : await loadImage(url)
      if (cancelled) return

      setImage(result.image)
      onSize(result.width, result.height)
    }

    render().catch((err) => console.error('Failed to render layout background', err))

    return () => {
      cancelled = true
    }
  }, [studioId, setupId, layoutBackgroundVersion])

  if (blank) {
    return (
      <Rect
        x={0}
        y={0}
        width={BLANK_SHEET_WIDTH_PX}
        height={BLANK_SHEET_HEIGHT_PX}
        fill="white"
        listening={false}
        {...PAPER_SHADOW}
      />
    )
  }
  if (!image) return null
  return <KonvaImage image={image} x={0} y={0} listening={false} name="layout-bg-image" {...PAPER_SHADOW} />
}
