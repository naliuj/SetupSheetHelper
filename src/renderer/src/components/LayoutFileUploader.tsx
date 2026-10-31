import { useEffect, useRef, useState } from 'react'
import { useEscapeToClose } from '@renderer/hooks/useEscapeToClose'
import { useModalDialog } from '@renderer/hooks/useModalDialog'
import { LAYOUT_FILE_FORMATS_HINT } from '@shared/constants/roomLayout'
import type { PickedPatchbayFile } from '@shared/types/patchbay'
import { parseDbTimestamp } from '@shared/utils/dbTimestamp'

/** What the card shows about an uploaded file — common to room layouts and patchbays. */
interface UploadedFile {
  originalName: string | null
  importedAt: string
  pageWidthPt: number | null
  pageHeightPt: number | null
}

/** How many cables a studio's setups have drawn on its patchbay, and in how many setups. */
interface CableUsage {
  setups: number
  cables: number
}

interface Kind {
  get: (studioId: number) => Promise<UploadedFile | null>
  /** One step: the file dialog, then straight in. */
  upload?: (studioId: number) => Promise<UploadedFile | null>
  /** Patchbays instead pick, then commit, so cables already drawn can be warned about in between.
   *  They can also be removed. */
  cables?: {
    pick: () => Promise<PickedPatchbayFile | null>
    commit: (studioId: number, sourcePath: string) => Promise<UploadedFile>
    usage: (studioId: number) => Promise<CableUsage>
    remove: (studioId: number) => Promise<void>
    removeLabel: string
  }
  fallbackName: string
  empty: string
  uploadLabel: string
  replaceLabel: string
  hint: string
}

/** The two per-studio drawings this uploader handles. */
const KINDS: Record<'layout' | 'patchbay', Kind> = {
  layout: {
    get: (studioId: number): Promise<UploadedFile | null> => window.api.layoutFile.getForStudio(studioId),
    upload: (studioId: number): Promise<UploadedFile | null> => window.api.layoutFile.importForStudio(studioId),
    fallbackName: 'Room layout file',
    empty: 'No room layout uploaded for this studio yet.',
    uploadLabel: 'Upload Layout File',
    replaceLabel: 'Replace Layout File',
    hint: LAYOUT_FILE_FORMATS_HINT
  },
  patchbay: {
    get: (studioId: number): Promise<UploadedFile | null> => window.api.patchbay.getFileForStudio(studioId),
    cables: {
      pick: () => window.api.patchbay.pickFile(),
      commit: (studioId, sourcePath) => window.api.patchbay.commitPickedToStudio(studioId, sourcePath),
      usage: (studioId) => window.api.patchbay.cableUsageForStudio(studioId),
      remove: (studioId) => window.api.patchbay.removeForStudio(studioId),
      removeLabel: 'Remove Patchbay PDF'
    },
    fallbackName: 'Patchbay drawing',
    empty: 'No patchbay uploaded for this studio yet.',
    uploadLabel: 'Upload Patchbay PDF',
    replaceLabel: 'Replace Patchbay PDF',
    hint: 'A PDF of the patchbay drawing. Cables snap to the jack labels it can read.'
  }
}

/** A patchbay change waiting on the user, because setups here already have cables on it. */
type PendingChange =
  | { action: 'replace'; studioId: number; picked: PickedPatchbayFile; usage: CableUsage }
  | { action: 'remove'; studioId: number; usage: CableUsage }

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

/** "3 cables in 2 setups" */
function describeUsage(usage: CableUsage): string {
  return `${pluralize(usage.cables, 'cable')} in ${pluralize(usage.setups, 'setup')}`
}

interface Props {
  /** Which of the studio's drawings this manages. */
  kind?: keyof typeof KINDS
  /** Null while a brand-new studio has not been written to the database yet. */
  studioId: number | null
  /** Creates the studio row on demand, for the null case above, and returns its id. Without one a
   *  null studioId simply disables the button. */
  ensureStudioId?: () => Promise<number | null>
  disabled?: boolean
}

/** A studio's room layout or patchbay drawing: what's uploaded, and a button to upload or replace
 *  it. A patchbay can also be removed, and both that and replacing it ask first when setups here
 *  have cables on it. Either way the cables are kept, since they belong to the setups. */
export default function LayoutFileUploader({
  kind = 'layout',
  studioId,
  ensureStudioId,
  disabled
}: Props): JSX.Element {
  const config = KINDS[kind]
  const [layout, setLayout] = useState<UploadedFile | null>(null)
  const [importing, setImporting] = useState(false)
  const [pending, setPending] = useState<PendingChange | null>(null)
  const [applying, setApplying] = useState(false)
  // An upload on a new studio creates the row mid-flight, so studioId changes from null to an id
  // while the file dialog is still open and re-runs the effect below. Its "nothing here yet" answer
  // must not be allowed to land after the import's result and blank the card.
  const importingRef = useRef(false)

  useEffect(() => {
    if (studioId == null) {
      setLayout(null)
      return
    }
    if (importingRef.current) return
    config.get(studioId).then(setLayout)
  }, [studioId, config])

  async function upload(): Promise<void> {
    setImporting(true)
    importingRef.current = true
    try {
      const id = studioId ?? (await ensureStudioId?.()) ?? null
      if (id == null) return
      if (config.cables) {
        const picked = await config.cables.pick()
        if (!picked) return
        const usage = await config.cables.usage(id)
        if (usage.cables > 0) setPending({ action: 'replace', studioId: id, picked, usage })
        else setLayout(await config.cables.commit(id, picked.sourcePath))
        return
      }
      const result = await config.upload?.(id)
      if (result) setLayout(result)
    } finally {
      importingRef.current = false
      setImporting(false)
    }
  }

  async function remove(): Promise<void> {
    if (!config.cables || studioId == null) return
    setImporting(true)
    try {
      const usage = await config.cables.usage(studioId)
      if (usage.cables > 0) setPending({ action: 'remove', studioId, usage })
      else {
        await config.cables.remove(studioId)
        setLayout(null)
      }
    } finally {
      setImporting(false)
    }
  }

  async function confirmPending(): Promise<void> {
    if (!pending || !config.cables) return
    setApplying(true)
    try {
      if (pending.action === 'replace') {
        setLayout(await config.cables.commit(pending.studioId, pending.picked.sourcePath))
      } else {
        await config.cables.remove(pending.studioId)
        setLayout(null)
      }
    } finally {
      setApplying(false)
      setPending(null)
    }
  }

  const closePending = (): void => {
    if (!applying) setPending(null)
  }
  useEscapeToClose(closePending, !!pending)
  const pendingTitle =
    pending?.action === 'remove' ? 'Remove the patchbay drawing?' : 'Replace the patchbay drawing?'
  const pendingDialog = useModalDialog(pendingTitle, !!pending)

  return (
    <div>
      {layout ? (
        <div className="card">
          <div className="card-title">{layout.originalName ?? config.fallbackName}</div>
          <div className="card-sub">
            Imported {parseDbTimestamp(layout.importedAt).toLocaleString()}
            {layout.pageWidthPt && layout.pageHeightPt
              ? ` — ${Math.round(layout.pageWidthPt)}×${Math.round(layout.pageHeightPt)} pt`
              : ''}
          </div>
        </div>
      ) : (
        <div className="empty-state">{config.empty}</div>
      )}

      <div className="inline-form">
        <button className="btn primary" onClick={upload} disabled={importing || disabled}>
          {importing ? 'Importing…' : layout ? config.replaceLabel : config.uploadLabel}
        </button>
        {config.cables && layout && (
          <button className="btn" onClick={remove} disabled={importing || disabled}>
            {config.cables.removeLabel}
          </button>
        )}
      </div>
      <p className="card-sub" style={{ marginTop: 6 }}>
        {config.hint}
      </p>

      {pending && (
        <div className="modal-overlay" onClick={closePending}>
          <div className="modal" {...pendingDialog} onClick={(e) => e.stopPropagation()} style={{ width: 420 }}>
            <h2 style={{ marginTop: 0 }}>{pendingTitle}</h2>
            {pending.action === 'replace' ? (
              <p className="card-sub">
                {describeUsage(pending.usage)}{' '}
                {pending.usage.cables === 1 ? 'stays where it is' : 'stay where they are'}.
                Ends that land on a jack in &quot;{pending.picked.fileName}&quot; take that jack&apos;s name, and the
                rest show as unlabeled.
              </p>
            ) : (
              <p className="card-sub">
                {describeUsage(pending.usage)} {pending.usage.cables === 1 ? 'is' : 'are'} kept, hidden until a drawing
                is uploaded again.
              </p>
            )}
            <div className="modal-actions">
              <button className="btn" onClick={closePending} disabled={applying}>
                Cancel
              </button>
              {pending.action === 'replace' ? (
                <button className="btn primary" onClick={confirmPending} disabled={applying}>
                  {applying ? 'Importing…' : 'Replace'}
                </button>
              ) : (
                <button className="btn danger" onClick={confirmPending} disabled={applying}>
                  {applying ? 'Removing…' : 'Remove'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
