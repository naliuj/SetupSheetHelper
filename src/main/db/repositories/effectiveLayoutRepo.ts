import type { EffectiveLayout } from '@shared/types/entities'
import { getSetupLayoutOverride } from './setupLayoutOverrideRepo'
import { getLayoutFileForStudio } from './roomLayoutFileRepo'

/** Resolves what Layout Mode should actually render for a setup: its own override (blank sheet
 *  or its own imported file) if it has one, otherwise the studio's shared layout file, otherwise
 *  null (gate the user). */
export function getEffectiveLayoutForSetup(setupId: number | null, studioId: number): EffectiveLayout {
  if (setupId) {
    const override = getSetupLayoutOverride(setupId)
    if (override) {
      return override.kind === 'blank'
        ? { kind: 'blank' }
        : {
            kind: 'file',
            filePath: override.filePath as string,
            originalName: override.originalName,
            pageWidthPt: override.pageWidthPt,
            pageHeightPt: override.pageHeightPt
          }
    }
  }

  const studioLayout = getLayoutFileForStudio(studioId)
  return studioLayout
    ? {
        kind: 'file',
        filePath: studioLayout.filePath,
        originalName: studioLayout.originalName,
        pageWidthPt: studioLayout.pageWidthPt,
        pageHeightPt: studioLayout.pageHeightPt
      }
    : null
}
