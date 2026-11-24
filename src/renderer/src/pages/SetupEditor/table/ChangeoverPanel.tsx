import { useMemo, useState } from 'react'
import type { SetupItemDraft, SetupItemOutboardSlot } from '@shared/types/setup'
import type { Mic, OutboardGear, Preamp } from '@shared/types/entities'
import { describeBandChanges, type BandChanges, type GearNames } from '@shared/utils/bands'
import { stripManufacturerPrefix } from '@shared/utils/manufacturerPrefix'
import { useCatalogStoreState } from '@renderer/state/catalogStoreContext'
import { useSetupStoreApi } from '@renderer/state/setupStoreContext'
import { useModalDialog } from '@renderer/hooks/useModalDialog'
import { useEscapeToClose } from '@renderer/hooks/useEscapeToClose'

/** One outboard slot's name, the way main's resolveOutboardSlotText reads it for the exports. */
export function outboardSlotName(slot: SetupItemOutboardSlot | undefined, outboardGear: OutboardGear[]): string {
  if (!slot) return ''
  const gear = slot.outboardId != null ? outboardGear.find((g) => g.id === slot.outboardId) : undefined
  return gear ? stripManufacturerPrefix(gear.name, gear.manufacturer ?? '') : (slot.outboardText?.trim() ?? '')
}

/** Gear names for the band change text, matching main's resolveGearLabels so the table, this panel
 *  and the printed page all name gear the same way. Catalog name first, typed text otherwise. */
export function catalogGearNames(mics: Mic[], preamps: Preamp[], outboardGear: OutboardGear[]): GearNames<SetupItemDraft> {
  return {
    mic: (item) => (item.micId != null ? mics.find((m) => m.id === item.micId)?.name : null) ?? item.micText,
    preamp: (item) => {
      const preamp = item.preampId != null ? preamps.find((p) => p.id === item.preampId) : undefined
      return preamp ? stripManufacturerPrefix(preamp.name, preamp.manufacturer ?? '') : item.preampText
    },
    outboards: (item) =>
      [...item.outboards]
        .sort((a, b) => a.slotIndex - b.slotIndex)
        .map((slot) => outboardSlotName(slot, outboardGear))
        .filter(Boolean)
        .join(', ')
  }
}

interface Props {
  bandIndex: number
  bandName: string
  changes: BandChanges<SetupItemDraft>
  onClose(): void
}

/** The changeover list for one band: what to re-patch, add and remove coming from the band
 *  before, with a Print… button for the one-page version (main's exportChangeoverPdf). */
export default function ChangeoverPanel({ bandIndex, bandName, changes, onClose }: Props): JSX.Element {
  const title = `Changeover to ${bandName}`
  const dialog = useModalDialog(title)
  useEscapeToClose(onClose)
  const setupStoreApi = useSetupStoreApi()
  const mics = useCatalogStoreState((s) => s.mics)
  const preamps = useCatalogStoreState((s) => s.preamps)
  const outboardGear = useCatalogStoreState((s) => s.outboardGear)
  const lists = useMemo(
    () => describeBandChanges(changes, catalogGearNames(mics, preamps, outboardGear)),
    [changes, mics, preamps, outboardGear]
  )
  const [printing, setPrinting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function handlePrint(): Promise<void> {
    if (printing) return
    setPrinting(true)
    setMessage(null)
    try {
      // The PDF is built in main from the saved sheet, so unsaved edits have to land first.
      if (setupStoreApi.getState().isDirty) await setupStoreApi.getState().save()
      // save() never throws; a failure leaves the sheet dirty, and printing would use stale data.
      if (setupStoreApi.getState().isDirty) {
        setMessage("Couldn't save the sheet, so nothing was printed.")
        return
      }
      const setupId = setupStoreApi.getState().setupId
      if (setupId == null) return
      const result = await window.api.exportPdf.exportChangeover({ setupId, bandIndex })
      if (!result.canceled) setMessage(`Exported to ${result.filePath}`)
    } catch (err) {
      setMessage(`Print failed — ${err instanceof Error ? err.message : 'please try again.'}`)
    } finally {
      setPrinting(false)
    }
  }

  const sections: [string, string[]][] = [
    ['Re-patch', lists.changed],
    ['Add', lists.added],
    ['Remove', lists.removed]
  ]

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal changeover-panel" {...dialog} onClick={(e) => e.stopPropagation()} style={{ width: 520 }}>
        <h2 style={{ marginTop: 0 }}>{title}</h2>
        {sections.map(([heading, lines]) =>
          lines.length === 0 ? null : (
            <section key={heading}>
              <h3>{heading}</h3>
              <ul>
                {lines.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </section>
          )
        )}
        {sections.every(([, lines]) => lines.length === 0) && <p className="card-sub">Same patch as the band before.</p>}
        {/* Always mounted: screen readers announce text added to a live region, not one that appears with its text. */}
        <div role="status">{message && <p className="card-sub">{message}</p>}</div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button className="btn" onClick={onClose}>
            Close
          </button>
          <button className="btn primary" onClick={() => void handlePrint()} aria-disabled={printing}>
            Print…
          </button>
        </div>
      </div>
    </div>
  )
}
