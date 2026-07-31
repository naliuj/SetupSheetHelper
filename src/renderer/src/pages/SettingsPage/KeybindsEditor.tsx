import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useKeybindPrefsStore } from '@renderer/state/keybindPrefsStore'
import {
  KEYBIND_ACTIONS,
  comboHasModifier,
  formatCombo,
  normalizeKeyEvent,
  type KeybindActionDef
} from '@shared/constants/keybindActions'

// A whitelist, not just an ordering: a category missing from this array is silently dropped from
// the UI, leaving its actions working but invisible and unrebindable. Add new categories here.
const CATEGORY_ORDER = ['App', 'File', 'Edit', 'Table', 'Layout', 'Multi Setup']

function groupByCategory(actions: KeybindActionDef[]): [string, KeybindActionDef[]][] {
  const groups = new Map<string, KeybindActionDef[]>()
  for (const action of actions) {
    const list = groups.get(action.category) ?? []
    list.push(action)
    groups.set(action.category, list)
  }
  return CATEGORY_ORDER.filter((c) => groups.has(c)).map((c) => [c, groups.get(c)!])
}

/** Every rebindable app shortcut, grouped by category, with inline conflict warnings. Arrow-key
 *  nudge and Space-to-pan in Layout Mode are deliberately NOT here — fixed creative-tool
 *  conventions, not part of the rebindable set (see keybindActions.ts). */
export default function KeybindsEditor(): JSX.Element {
  const overrides = useKeybindPrefsStore((s) => s.overrides)
  const resolve = useKeybindPrefsStore((s) => s.resolve)
  const setBinding = useKeybindPrefsStore((s) => s.setBinding)
  const resetBinding = useKeybindPrefsStore((s) => s.resetBinding)
  const resetAll = useKeybindPrefsStore((s) => s.resetAll)
  const conflictsFor = useKeybindPrefsStore((s) => s.conflictsFor)
  const [recordingId, setRecordingId] = useState<string | null>(null)
  const [captureError, setCaptureError] = useState<string | null>(null)

  function startRecording(action: KeybindActionDef): void {
    setCaptureError(null)
    setRecordingId(action.id)
  }

  function handleCaptureKeyDown(action: KeybindActionDef, e: React.KeyboardEvent): void {
    e.preventDefault()
    e.stopPropagation()
    if (e.key === 'Escape') {
      setRecordingId(null)
      return
    }
    const combo = normalizeKeyEvent(e.nativeEvent)
    if (!combo) return // only a modifier held so far — keep waiting
    if (!comboHasModifier(combo) && !action.allowBareKey) {
      setCaptureError('This shortcut needs a modifier key (Cmd/Ctrl, Shift, or Alt) to avoid colliding with typing.')
      return
    }
    setCaptureError(null)
    setRecordingId(null)
    void setBinding(action.id, combo)
  }

  return (
    <div>
      {captureError && (
        <p className="card-sub" style={{ color: 'var(--color-danger)' }}>
          {captureError}
        </p>
      )}

      {groupByCategory(KEYBIND_ACTIONS).map(([category, actions]) => (
        <div key={category} style={{ marginBottom: 20 }}>
          <div className="section-title" style={{ marginTop: 0 }}>
            {category}
          </div>
          {actions.map((action) => {
            const combo = resolve(action.id)
            const isOverridden = overrides[action.id] != null
            const conflicts = conflictsFor(action.id)
            const isRecording = recordingId === action.id
            return (
              <div
                key={action.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '6px 0',
                  borderBottom: '1px solid var(--color-border)'
                }}
              >
                <span style={{ flex: 1 }}>{action.label}</span>
                {isRecording ? (
                  <input
                    autoFocus
                    readOnly
                    value="Press a key…"
                    onKeyDown={(e) => handleCaptureKeyDown(action, e)}
                    onBlur={() => setRecordingId(null)}
                    style={{ width: 140, textAlign: 'center' }}
                  />
                ) : (
                  <button
                    type="button"
                    className="btn small"
                    style={{ width: 140 }}
                    onClick={() => startRecording(action)}
                  >
                    {formatCombo(combo)}
                  </button>
                )}
                <button
                  type="button"
                  className="btn small"
                  disabled={!isOverridden}
                  onClick={() => resetBinding(action.id)}
                  title="Reset to default"
                >
                  Reset
                </button>
                {conflicts.length > 0 && (
                  <span className="card-sub inline-icon-text" style={{ color: 'var(--color-warning)' }}>
                    <AlertTriangle size={13} aria-hidden="true" />
                    Also used by {conflicts.map((c) => c.label).join(', ')}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      ))}

      <button type="button" className="btn" onClick={() => resetAll()}>
        Reset all to defaults
      </button>
    </div>
  )
}
