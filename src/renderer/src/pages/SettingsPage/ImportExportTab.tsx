import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { STUDIO_DOWNLOADS_URL } from '@shared/constants/urls'

/** What the tab shows after an import finishes: either a failure to report, or the studios/setups
 *  that actually landed. This lives on the tab rather than on the picker page because the picker
 *  unmounts the moment the import succeeds — the old inline message was on screen for 800ms and
 *  in practice was never read. */
export type ImportFeedback =
  | { kind: 'error'; message: string }
  | { kind: 'done'; noun: 'studio' | 'setup'; imported: string[]; skipped: string[] }

interface Props {
  feedback: ImportFeedback | null
  onDismissFeedback: () => void
  onExportStudios: () => void
  onImportStudios: () => void
  onBrowseLibrary: () => void
  onExportSetups: () => void
  onImportSetups: () => void
}

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`
}

function FeedbackPanel({ feedback, onDismiss }: { feedback: ImportFeedback; onDismiss: () => void }): JSX.Element {
  if (feedback.kind === 'error') {
    return (
      <div className="import-feedback is-error">
        <div style={{ flex: 1, minWidth: 0 }}>{feedback.message}</div>
        <button className="btn small" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    )
  }

  return (
    <div className="import-feedback">
      <Check size={16} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2, color: 'var(--color-accent)' }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600 }}>Imported {plural(feedback.imported.length, feedback.noun)}</div>
        {feedback.imported.length > 0 && (
          <div className="card-sub" style={{ marginTop: 3 }}>
            {feedback.imported.join(' · ')}
          </div>
        )}
        {feedback.skipped.length > 0 && (
          <div className="card-sub" style={{ marginTop: 3 }}>
            Skipped {feedback.skipped.join(', ')}, which you already had.
          </div>
        )}
        <div className="inline-form" style={{ marginTop: 9 }}>
          <button className="btn small" onClick={onDismiss}>
            Dismiss
          </button>
        </div>
      </div>
    </div>
  )
}

/** The Import/Export tab. Two titled sections rather than four bare buttons: the file formats are
 *  not self-explanatory, and nothing here previously said a studio file carries the room layout
 *  and preamps too, or that studios can be downloaded rather than built by hand. Section shape
 *  follows the export-column picker, which moved into an inset panel for the same reason — as
 *  plain dim body copy it read as skippable boilerplate. */
export default function ImportExportTab({
  feedback,
  onDismissFeedback,
  onExportStudios,
  onImportStudios,
  onBrowseLibrary,
  onExportSetups,
  onImportSetups
}: Props): JSX.Element {
  const [studioCount, setStudioCount] = useState<number | null>(null)
  const [setupCount, setSetupCount] = useState<number | null>(null)

  // Re-counted whenever the feedback changes, so an import that just added studios updates the
  // count sitting right above it.
  useEffect(() => {
    window.api.studios.listCustom().then((studios) => setStudioCount(studios.length))
    window.api.setups.list().then((setups) => setSetupCount(setups.length))
  }, [feedback])

  return (
    <div>
      {feedback && <FeedbackPanel feedback={feedback} onDismiss={onDismissFeedback} />}

      <div className="io-section">
        <div className="io-section-head">
          <span className="io-section-title">Studios</span>
          <span className="io-section-count">
            {studioCount == null ? '' : plural(studioCount, 'custom studio')}
          </span>
        </div>
        <p className="card-sub">
          A studio file carries the whole room: its mic locker, outboard rack, preamps, and the room
          layout PDF. Importing one adds it as a Custom Studio alongside what you already have.
        </p>
        <div className="inline-form" style={{ marginTop: 10 }}>
          <button className="btn" onClick={onExportStudios}>
            Export studios…
          </button>
          <button className="btn" onClick={onImportStudios}>
            Import studios…
          </button>
          <button className="btn" onClick={onBrowseLibrary}>
            Browse studios online…
          </button>
        </div>
        <p className="io-section-hint">
          Don&apos;t have a file?{' '}
          <a href={STUDIO_DOWNLOADS_URL} target="_blank" rel="noreferrer">
            Browse downloadable studios
          </a>{' '}
          for rooms other engineers have shared.
        </p>
      </div>

      <div className="io-section">
        <div className="io-section-head">
          <span className="io-section-title">Setups</span>
          <span className="io-section-count">{setupCount == null ? '' : plural(setupCount, 'saved setup')}</span>
        </div>
        <p className="card-sub">
          A setup file carries the sheet itself: every channel row, your column choices, session
          notes, and any layout overrides. Importing asks which studio to file the setups under, and
          matches gear by name against that studio&apos;s lockers.
        </p>
        <div className="inline-form" style={{ marginTop: 10 }}>
          <button className="btn" onClick={onExportSetups}>
            Export setups…
          </button>
          <button className="btn" onClick={onImportSetups}>
            Import setups…
          </button>
        </div>
      </div>
    </div>
  )
}
