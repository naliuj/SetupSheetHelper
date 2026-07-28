import { useEffect, useRef, useState } from 'react'
import { Pencil } from 'lucide-react'
import type { MultiSetup, MultiSetupMember } from '@shared/types/setup'
import { useNavigationStore } from '@renderer/state/navigationStore'
import Icon from '@renderer/components/Icon'
import MultiSetupNamePromptModal from './MultiSetupNamePromptModal'
import AddExistingSetupModal from './AddExistingSetupModal'

type PromptMode = 'create' | 'newBand' | 'rename'

/** Lets the editor hop between the setups grouped into one Multi Setup (e.g. one tab per band in a
 *  multi-act recording session) without detouring through Home, and is the entry point for
 *  grouping a standalone setup into one in the first place. Reuses the app's existing
 *  single-document navigation — clicking a tab just calls goToSetup, the same action Home's "open
 *  a saved setup" already uses, so SetupEditor's normal load effect picks up the new setup with no
 *  extra plumbing. */
export default function MultiSetupTabs(): JSX.Element | null {
  const buildingId = useNavigationStore((s) => s.buildingId)
  const studioId = useNavigationStore((s) => s.studioId)
  const setupId = useNavigationStore((s) => s.setupId)
  const goToSetup = useNavigationStore((s) => s.goToSetup)

  const [group, setGroup] = useState<MultiSetup | null>(null)
  const [members, setMembers] = useState<MultiSetupMember[]>([])
  const [loaded, setLoaded] = useState(false)
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [prompt, setPrompt] = useState<{ mode: PromptMode; initialValue?: string } | null>(null)
  const [addExistingOpen, setAddExistingOpen] = useState(false)
  const addMenuRef = useRef<HTMLDivElement>(null)

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

  // Close the "+" menu on an outside click.
  useEffect(() => {
    if (!addMenuOpen) return
    function onDown(e: MouseEvent): void {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) setAddMenuOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [addMenuOpen])

  if (!loaded || setupId == null || studioId == null) return null

  async function handleCreateGroup(name: string): Promise<void> {
    await window.api.multiSetups.createFromSetup(setupId as number, name)
    reload(setupId as number)
  }

  async function handleNewBand(name: string): Promise<void> {
    if (!group) return
    await window.api.multiSetups.createAndAdd(group.id, name)
    reload(setupId as number)
  }

  async function handleRename(name: string): Promise<void> {
    if (!group) return
    await window.api.multiSetups.rename(group.id, name)
    reload(setupId as number)
  }

  async function handleRemove(): Promise<void> {
    await window.api.multiSetups.removeSetup(setupId as number)
    reload(setupId as number)
  }

  async function handleAddExisting(existingSetupId: number): Promise<void> {
    if (!group) return
    await window.api.multiSetups.addExisting(group.id, existingSetupId)
    reload(setupId as number)
  }

  if (!group) {
    return (
      <div className="quick-setup-row" style={{ padding: '0 16px' }}>
        <button className="link-button" onClick={() => setPrompt({ mode: 'create' })}>
          + Group into Multi Setup…
        </button>
        {prompt && (
          <MultiSetupNamePromptModal
            heading="Group into Multi Setup"
            confirmLabel="Group"
            onClose={() => setPrompt(null)}
            onSubmit={handleCreateGroup}
          />
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 16px 8px', flexWrap: 'wrap' }}>
      <span className="card-sub" style={{ fontWeight: 600 }}>
        {group.name}
      </span>
      <button
        className="folder-tree-action"
        title="Rename Multi Setup"
        aria-label="Rename Multi Setup"
        onClick={() => setPrompt({ mode: 'rename', initialValue: group.name })}
      >
        <Pencil size={13} aria-hidden="true" />
      </button>
      {members.map((m) => (
        <button
          key={m.id}
          className={`btn small${m.id === setupId ? ' primary' : ''}`}
          onClick={() => m.id !== setupId && goToSetup(buildingId, studioId, m.id)}
        >
          {m.name}
        </button>
      ))}
      <div ref={addMenuRef} style={{ position: 'relative' }}>
        <button className="btn small" onClick={() => setAddMenuOpen((v) => !v)} aria-label="Add band">
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
                setPrompt({ mode: 'newBand' })
              }}
            >
              New band
            </div>
            <div
              className="picker-menu-row"
              onClick={() => {
                setAddMenuOpen(false)
                setAddExistingOpen(true)
              }}
            >
              Add existing setup
            </div>
          </div>
        )}
      </div>
      <button className="btn small" onClick={handleRemove}>
        Remove from group
      </button>

      {prompt && (
        <MultiSetupNamePromptModal
          heading={prompt.mode === 'newBand' ? 'New band' : 'Rename Multi Setup'}
          confirmLabel={prompt.mode === 'newBand' ? 'Add' : 'Rename'}
          initialValue={prompt.initialValue}
          onClose={() => setPrompt(null)}
          onSubmit={prompt.mode === 'newBand' ? handleNewBand : handleRename}
        />
      )}
      {addExistingOpen && (
        <AddExistingSetupModal
          studioId={studioId}
          excludeSetupId={setupId}
          onClose={() => setAddExistingOpen(false)}
          onAdd={handleAddExisting}
        />
      )}
    </div>
  )
}
