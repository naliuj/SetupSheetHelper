import { useEffect, useRef, useState } from 'react'
import { GitCompare, MoreHorizontal } from 'lucide-react'
import type { MultiSetup, MultiSetupMember } from '@shared/types/setup'
import { useNavigationStore } from '@renderer/state/navigationStore'
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
  const setupName = useSetupStore((s) => s.name)
  const sessionDate = useSetupStore((s) => s.sessionDate)
  const setSetupName = useSetupStore((s) => s.setName)

  const [group, setGroup] = useState<MultiSetup | null>(null)
  const [members, setMembers] = useState<MultiSetupMember[]>([])
  const [loaded, setLoaded] = useState(false)
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [overflowOpen, setOverflowOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [newSetupOpen, setNewSetupOpen] = useState(false)
  const [addExistingOpen, setAddExistingOpen] = useState(false)
  const addMenuRef = useRef<HTMLDivElement>(null)
  const overflowRef = useRef<HTMLDivElement>(null)

  function reload(id: number): void {
    window.api.multiSetups.getForSetup(id).then((g) => {
      setGroup(g)
      setLoaded(true)
      if (g) window.api.multiSetups.listMembers(g.id).then(setMembers)
      else setMembers([])
    })
  }

  useEffect(() => {
    if (setupId == null) {
      setLoaded(true)
      setGroup(null)
      setMembers([])
      return
    }
    setLoaded(false)
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

  async function handleRemove(): Promise<void> {
    await window.api.multiSetups.removeSetup(currentSetupId)
    reload(currentSetupId)
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

      {/* Rename and unlink live behind an overflow menu rather than inline, so a destructive
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
                handleRemove()
              }}
            >
              Remove this setup from the Multi Setup
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
    </div>
  )
}
