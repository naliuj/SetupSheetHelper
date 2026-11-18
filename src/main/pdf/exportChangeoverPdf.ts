import type { ExportChangeoverPdfInput, ExportSetupPdfResult } from '@shared/types/ipc'

/** The printable changeover list between one band and the band before it: what to re-patch,
 *  add and remove at the break. Lines come from describeChange in shared/utils/bands.ts, so they
 *  read exactly like the editor's changeover panel. */
export async function exportChangeoverPdf(input: ExportChangeoverPdfInput): Promise<ExportSetupPdfResult> {
  void input
  throw new Error('Not implemented')
}
