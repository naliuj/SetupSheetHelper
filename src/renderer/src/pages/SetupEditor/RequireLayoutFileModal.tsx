import LayoutFileUploader from '@renderer/components/LayoutFileUploader'
import { useEscapeToClose } from '@renderer/hooks/useEscapeToClose'

interface Props {
  studioId: number
  onUploaded: () => void
  onCancel: () => void
}

/** Blocks entering Layout Mode until the studio has a room layout assigned, and proceeds into
 *  Layout Mode the moment a layout is successfully uploaded (no extra confirmation click). */
export default function RequireLayoutFileModal({ studioId, onUploaded, onCancel }: Props): JSX.Element {
  useEscapeToClose(onCancel)
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 380 }}>
        <h2 style={{ marginTop: 0 }}>Room layout needed</h2>
        <p className="card-sub" style={{ marginTop: 0 }}>
          This studio doesn't have a room layout yet — upload one to use Layout Mode.
        </p>
        <LayoutFileUploader studioId={studioId} onUploaded={onUploaded} />
        <div className="modal-actions">
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
