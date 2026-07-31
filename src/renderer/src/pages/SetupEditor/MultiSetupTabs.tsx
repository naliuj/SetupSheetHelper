import { useEffect, useRef, useState } from 'react'
import { GitCompare, MoreHorizontal } from 'lucide-react'
import { useNavigationStore } from '@renderer/state/navigationStore'
import { useMultiSetupStore } from '@renderer/state/multiSetupStore'
import { useSetupStore } from '@renderer/state/setupStore'
import Icon from '@renderer/components/Icon'
import CreateMultiSetupModal from './CreateMultiSetupModal'
import MultiSetupNamePromptModal from './MultiSetupNamePromptModal'
import AddExistingSetupModal from './AddExistingSetupModal'

/** Lets the editor hop between the setups grouped into one Multi Setup (e.g. one per band in a
 *  multi-act recording session) without detouring through Home, and is the entry point for
 *  grouping a standalone setup in the first place.
 *
 *  Reuses the app's existing single-document navigation — clicking a tab just calls goToSetup, the
 *  same action Home's "open a saved setup" uses, so SetupEditor's normal load effect picks up the
 *  new setup with no extra plumbing. */
interface Props {
  /** Opens the Compare page. Lives here rather than in SetupEditor because the group id is only
   *  known once this component has resolved it. */
  onOpenCompare: (multiSetupId: number) => void
}

export default function MultiSetupTabs({ onOpenCompare }: Props): JSX.Element | null {
  const buildingId = useNavigationStore((s) => s.buildingId)
  const studioId = useNavigationStore((s) => s.studioId)
  const setupId = useNavigationStore((s) => s.setupId)
  const goToSetup = useNavigationStore((s) => s.goToSetup)
  const goToHome = useNavigationStore((s) => s.goToHome)
  const setupName = useSetupStore((s) => s.name)
  const sessionDate = useSetupStore((s) => s.sessionDate)
  const setSetupName = useSetupStore((s) => s.setName)

  // Group + members live in a store, not here, so SetupToolbar's Cmd/Ctrl+1..9 handlers can reach
  // the member list — it's a sibling component with no path to this one's state.
  const group = useMultiSetupStore((s) => s.group)
  const members = useMultiSetupStore((s) => s.members)
  const loaded = useMultiSetupStore((s) => s.loaded)
  const reload = useMultiSetupStore((s) => s.reload)
  const beginReload = useMultiSetupStore((s) => s.beginReload)

  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [overflowOpen, setOverflowOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [newSetupOpen, setNewSetupOpen] = useState(false)
  const [addExistingOpen, setAddExistingOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const addMenuRef = useRef<HTMLDivElement>(null)
  const overflowRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    beginReload()
    reload(setupId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setupId])

  // Close either floating menu on an outside click.
  useEffect(() => {
    if (!addMenuOpen && !overflowOpen) return
    function onDown(e: MouseEvent): void {
      const target = e.target as Node
      if (addMenuRef.current && !addMenuRef.current.contains(target)) setAddMenuOpen(false)
      if (overflowRef.current && !overflowRef.current.contains(target)) setOverflowOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [addMenuOpen, overflowOpen])

  if (!loaded || setupId == null || studioId == null) return null
  const currentSetupId = setupId

  async function handleCreate(input: {
    name: string
    sourceSetupName: string
    newSetupNames: string[]
  }): Promise<void> {
    await window.api.multiSetups.createWithSetups({ sourceSetupId: currentSetupId, ...input })
    // Renaming row 1 wrote straight to the DB, so the open setup's store is now stale. It has to be
    // told, or the next autosave would push the old in-memory name back over the new one —
    // setupStore.save() sends state.name to setups.rename on every dirty flush.
    if (input.sourceSetupName !== setupName) setSetupName(input.sourceSetupName)
    // Stay on the setup the user was already working in — the siblings just appear as tabs.
    reload(currentSetupId)
  }

  async function handleNewSetup(name: string): Promise<void> {
    if (!group) return
    await window.api.multiSetups.createAndAdd(group.id, name)
    reload(currentSetupId)
  }

  async function handleRename(name: string): Promise<void> {
    if (!group) return
    await window.api.multiSetups.rename(group.id, name)
    reload(currentSetupId)
  }

  /** Deletes the open setup outright — sheet, items, layout and all. Routed through the ordinary
   *  setups.remove, which is where the group-dissolve rule already lives (setupsRepo.removeSetups:
   *  "every delete path funnels through this one function"), so a group left with one member
   *  dissolves for free.
   *
   *  Navigates to a neighbour rather than reloading in place: after a real delete the open setup no
   *  longer exists, so staying put would leave the editor on a phantom. A group always has at least
   *  two members (creation requires two, the dissolve rule fires at one), so the fallback Home is
   *  unreachable in practice — it's there so a future single-member group can't strand the user. */
  async function handleDelete(): Promise<void> {
    const index = members.findIndex((m) => m.id === currentSetupId)
    const neighbour = members[index - 1] ?? members[index + 1] ?? null
    // Flush first, exactly as openCompare does. Autosave is debounced, so deleting a sheet with an
    // edit still in flight would leave a timer pointing at a row that no longer exists — and its
    // items-table replace would then fail on the foreign key.
    const state = useSetupStore.getState()
    if (state.isDirty) await state.save()
    await window.api.setups.remove(currentSetupId)
    setDeleteOpen(false)
    if (neighbour && studioId != null) goToSetup(buildingId, studioId, neighbour.id, { keepEditorMode: true })
    else goToHome()
  }

  async function handleAddExisting(existingSetupId: number): Promise<void> {
    if (!group) return
    await window.api.multiSetups.addExisting(group.id, existingSetupId)
    reload(currentSetupId)
  }

  if (!group) {
    return (
      <div className="quick-setup-row" style={{ padding: '0 16px', marginTop: 6 }}>
        <button className="link-button" onClick={() => setCreateOpen(true)}>
          + Add another setup…
        </button>
        {createOpen && (
          <CreateMultiSetupModal
            studioId={studioId}
            currentSetupName={setupName}
            currentSessionDate={sessionDate}
            onClose={() => setCreateOpen(false)}
            onCreate={handleCreate}
          />
        )}
      </div>
    )
  }

  return (
    <div className="multi-setup-tabs">
      <span className="card-sub" style={{ marginRight: 8, whiteSpace: 'nowrap' }}>
        {group.name}
      </span>
      {members.map((m) => (
        <button
          key={m.id}
          className={`multi-setup-tab${m.id === currentSetupId ? ' active' : ''}`}
          onClick={() => m.id !== currentSetupId && goToSetup(buildingId, studioId, m.id, { keepEditorMode: true })}
        >
          {m.name}
        </button>
      ))}

      <div ref={addMenuRef} style={{ position: 'relative', marginLeft: 4 }}>
        <button className="btn small" onClick={() => setAddMenuOpen((v) => !v)} aria-label="Add a setup">
          <Icon name="plus" size={14} />
        </button>
        {addMenuOpen && (
          <div
            className="picker-menu"
            style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, minWidth: 170 }}
          >
            <div
              className="picker-menu-row"
              onClick={() => {
                setAddMenuOpen(false)
                setNewSetupOpen(true)
              }}
            >
              New setup…
            </div>
            <div
              className="picker-menu-row"
              onClick={() => {
                setAddMenuOpen(false)
                setAddExistingOpen(true)
              }}
            >
              Add existing setup…
            </div>
          </div>
        )}
      </div>

      {/* Rename and delete live behind an overflow menu rather than inline, so a destructive
          action never sits in the tab row looking like just another tab. */}
      <div ref={overflowRef} style={{ position: 'relative' }}>
        <button className="btn small" onClick={() => setOverflowOpen((v) => !v)} aria-label="Multi Setup actions">
          <MoreHorizontal size={14} aria-hidden="true" />
        </button>
        {overflowOpen && (
          <div
            className="picker-menu"
            style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, minWidth: 240 }}
          >
            <div
              className="picker-menu-row"
              onClick={() => {
                setOverflowOpen(false)
                setRenameOpen(true)
              }}
            >
              Rename Multi Setup…
            </div>
            <div
              className="picker-menu-row"
              onClick={() => {
                setOverflowOpen(false)
                setDeleteOpen(true)
              }}
            >
              Delete this setup…
            </div>
          </div>
        )}
      </div>

      {/* A button, not a .multi-setup-tab — it isn't a setup you navigate to. */}
      <button
        className="btn small"
        onClick={() => onOpenCompare(group.id)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
      >
        <GitCompare size={14} aria-hidden="true" /> Compare
      </button>

      {renameOpen && (
        <MultiSetupNamePromptModal
          heading="Rename Multi Setup"
          confirmLabel="Rename"
          initialValue={group.name}
          onClose={() => setRenameOpen(false)}
          onSubmit={handleRename}
        />
      )}
      {newSetupOpen && (
        <MultiSetupNamePromptModal
          heading="New setup"
          confirmLabel="Add"
          onClose={() => setNewSetupOpen(false)}
          onSubmit={handleNewSetup}
        />
      )}
      {addExistingOpen && (
        <AddExistingSetupModal
          studioId={studioId}
          excludeSetupId={currentSetupId}
          onClose={() => setAddExistingOpen(false)}
          onAdd={handleAddExisting}
        />
      )}
      {deleteOpen && (
        <div className="modal-overlay" onClick={() => setDeleteOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 420 }}>
            <h2 style={{ marginTop: 0 }}>Delete &quot;{setupName}&quot;?</h2>
            <p className="card-sub">
              {members.length <= 2
                ? `This setup and everything on it will be deleted, and "${group.name}" will dissolve back into a single setup. This can't be undone.`
                : "This setup and everything on it will be deleted. This can't be undone."}
            </p>
            <div className="modal-actions">
              <button className="btn" onClick={() => setDeleteOpen(false)}>
                Cancel
              </button>
              <button className="btn danger" onClick={handleDelete}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
