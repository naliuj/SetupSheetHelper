import LayoutFileUploader from '../StudioAdminEditor/LayoutFileUploader'

interface Props {
  studioId: number
  onUploaded: () => void
  onCancel: () => void
}

/** Blocks entering Layout Mode until the studio has a room layout assigned — reuses the same
 *  uploader as Studio Admin's "Room Layout" section, and proceeds into Layout Mode the moment
 *  a layout is successfully uploaded (no extra confirmation click). */
export default function RequireLayoutFileModal({ studioId, onUploaded, onCancel }: Props): JSX.Element {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 380 }}>
        <h2 style={{ marginTop: 0 }}>Room Layout Needed</h2>
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
