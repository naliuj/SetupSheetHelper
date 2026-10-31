import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

/** PDF points → canvas pixels for every PDF drawn as a canvas background: 2× (144 px per inch),
 *  which is also the unit everything placed on that background is measured in. */
export const PDF_RENDER_SCALE = 2;

/** "app-file" is a registered standard scheme, which requires a non-empty host — a bare
 *  `app-file:///Users/...` is misparsed as host "Users". The absolute path goes through as one
 *  percent-encoded segment behind a fixed placeholder host instead (matched by the protocol
 *  handler in src/main/index.ts). */
export function appFileUrl(filePath: string): string {
  return `app-file://local-file/${encodeURIComponent(filePath)}`;
}

/** Renders page 1 of a PDF onto an offscreen canvas at PDF_RENDER_SCALE. */
export async function renderPdfPage(
  url: string,
): Promise<{ image: HTMLCanvasElement; width: number; height: number }> {
  const doc = await pdfjsLib.getDocument(url).promise;
  try {
    const page = await doc.getPage(1);
    const viewport = page.getViewport({ scale: PDF_RENDER_SCALE });
    const offscreen = document.createElement("canvas");
    offscreen.width = viewport.width;
    offscreen.height = viewport.height;
    const ctx = offscreen.getContext("2d");
    if (!ctx) throw new Error("Failed to get a 2D context to render the PDF");
    await page.render({ canvasContext: ctx, viewport }).promise;
    return { image: offscreen, width: viewport.width, height: viewport.height };
  } finally {
    void doc.destroy();
  }
}
