import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  MultiSetupComparison,
  MultiSetupComparisonItem,
  MultiSetupComparisonMember
} from '@shared/types/setup'
import { normalizeSourceName } from '@shared/utils/normalizeSourceName'
import { useEscapeToClose } from '@renderer/hooks/useEscapeToClose'
import ToggleSwitch from '@renderer/components/ToggleSwitch'

type Pivot = 'channel' | 'source'

interface Props {
  multiSetupId: number
  /** `didAlign` tells the editor whether the open setup needs reloading — an alignment may have
   *  rewritten it behind setupStore's back. */
  onBack: (didAlign: boolean) => void
}

/** One grid row: a channel number or a source key, plus each member's item(s) at that position. */
interface CompareRow {
  key: string
  label: string
  /** Parallel to `members` — a member can have zero items here (nothing patched) or, since the app
   *  tolerates duplicate channels, more than one. */
  cells: MultiSetupComparisonItem[][]
  matched: boolean
}

/** Signature two cells must share to count as "no changeover work". */
function channelSignature(item: MultiSetupComparisonItem): string {
  return `${normalizeSourceName(item.sourceName)}|${item.micLabel ?? ''}`
}

function sourceSignature(item: MultiSetupComparisonItem): string {
  return `${item.channel ?? ''}|${item.micLabel ?? ''}`
}

function buildRows(
  members: MultiSetupComparisonMember[],
  pivot: Pivot,
  linkKeyByName: Map<string, string>
): CompareRow[] {
  const buckets = new Map<string, { label: string; cells: MultiSetupComparisonItem[][] }>()

  members.forEach((member, memberIndex) => {
    for (const item of member.items) {
      let key: string
      let label: string
      if (pivot === 'channel') {
        // Rows with no channel assigned aren't changeover work — there's nothing patched to change.
        if (item.channel == null) continue
        key = String(item.channel)
        label = `Ch ${item.channel}`
      } else {
        const normalized = normalizeSourceName(item.sourceName)
        key = linkKeyByName.get(normalized) ?? normalized
        label = item.sourceName
      }

      let bucket = buckets.get(key)
      if (!bucket) {
        bucket = { label, cells: members.map(() => []) }
        buckets.set(key, bucket)
      }
      bucket.cells[memberIndex].push(item)
    }
  })

  const signature = pivot === 'channel' ? channelSignature : sourceSignature
  const rows = [...buckets].map(([key, { label, cells }]) => {
    // Matched means every member has exactly one item here and they all agree. A member with
    // nothing is a mismatch on purpose — that's a patch or unpatch between bands.
    const signatures = cells.map((items) => (items.length === 1 ? signature(items[0]) : null))
    const matched = signatures.every((s) => s !== null && s === signatures[0])
    return { key, label, cells, matched }
  })

  return pivot === 'channel'
    ? rows.sort((a, b) => Number(a.key) - Number(b.key))
    : rows.sort((a, b) => a.label.localeCompare(b.label))
}

/** Side-by-side view of every setup in a Multi Setup, so the engineer can see exactly what has to
 *  change between bands and fix the things that don't need to. Two pivots of the same data: by
 *  channel is the physical changeover work order, by source is the fix list. */
export default function MultiSetupComparePage({ multiSetupId, onBack }: Props): JSX.Element {
  const [data, setData] = useState<MultiSetupComparison | null>(null)
  const [pivot, setPivot] = useState<Pivot>('channel')
  const [differencesOnly, setDifferencesOnly] = useState(false)
  const [didAlign, setDidAlign] = useState(false)
  const [openRowKey, setOpenRowKey] = useState<string | null>(null)
  const [linkFrom, setLinkFrom] = useState<string | null>(null)

  const close = useCallback(() => onBack(didAlign), [onBack, didAlign])
  useEscapeToClose(close)

  const refetch = useCallback(() => {
    window.api.multiSetups.getComparison(multiSetupId).then(setData)
  }, [multiSetupId])

  useEffect(refetch, [refetch])

  const linkKeyByName = useMemo(() => {
    const map = new Map<string, string>()
    for (const link of data?.links ?? []) {
      for (const name of link.sourceNames) map.set(name, link.linkKey)
    }
    return map
  }, [data])

  const members = data?.members ?? []
  const rows = useMemo(() => buildRows(members, pivot, linkKeyByName), [members, pivot, linkKeyByName])
  const visibleRows = differencesOnly ? rows.filter((r) => !r.matched) : rows
  const mismatchCount = rows.filter((r) => !r.matched).length
  const unassignedCount =
    pivot === 'channel' ? members.reduce((n, m) => n + m.items.filter((i) => i.channel == null).length, 0) : 0

  async function align(row: CompareRow, referenceIndex: number): Promise<void> {
    const reference = row.cells[referenceIndex][0]
    if (!reference) return
    await window.api.multiSetups.alignRow({ multiSetupId, referenceItemId: reference.itemId, matchBy: pivot })
    setDidAlign(true)
    setOpenRowKey(null)
    refetch()
  }

  async function toggleLink(row: CompareRow): Promise<void> {
    const isLinked = (data?.links ?? []).some((l) => l.linkKey === row.key)
    if (isLinked) {
      // Break the whole set by unlinking each name — unlinkSource drops a group once it's down to
      // one name, so the last call clears the rest.
      const names = data?.links.find((l) => l.linkKey === row.key)?.sourceNames ?? []
      for (const name of names) await window.api.multiSetups.unlinkSource(multiSetupId, name)
    } else if (linkFrom && linkFrom !== row.key) {
      await window.api.multiSetups.linkSources(multiSetupId, [linkFrom, row.key])
    }
    setLinkFrom(null)
    setOpenRowKey(null)
    refetch()
  }

  if (!data) {
    return (
      <div className="page">
        <div className="empty-state">Loading…</div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="nav-crumbs">
        <button onClick={close}>Setup Editor</button> / Compare
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2>{data.multiSetup.name}</h2>
        <button className="btn" onClick={close}>
          Close
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div className="inline-form" style={{ marginTop: 0 }}>
          <button className={`btn ${pivot === 'channel' ? 'primary' : ''}`} onClick={() => setPivot('channel')}>
            By channel
          </button>
          <button className={`btn ${pivot === 'source' ? 'primary' : ''}`} onClick={() => setPivot('source')}>
            By source
          </button>
        </div>
        <ToggleSwitch checked={differencesOnly} onChange={setDifferencesOnly} label="Differences only" />
        <span className="card-sub">
          {mismatchCount} of {rows.length} {pivot === 'channel' ? 'channels need changeover' : 'sources differ'}
        </span>
      </div>

      <div className="panel" style={{ marginTop: 16, overflowX: 'auto' }}>
        {visibleRows.length === 0 ? (
          <div className="empty-state">
            {rows.length === 0 ? 'Nothing to compare yet.' : 'Everything matches across these setups.'}
          </div>
        ) : (
          <table className="compare-table">
            <thead>
              <tr>
                <th>{pivot === 'channel' ? 'Channel' : 'Source'}</th>
                {members.map((m) => (
                  <th key={m.setupId}>{m.name}</th>
                ))}
                <th />
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row.key} className={`compare-row ${row.matched ? 'match' : 'mismatch'}`}>
                  <td style={{ whiteSpace: 'nowrap', fontWeight: row.matched ? 400 : 600 }}>{row.label}</td>
                  {row.cells.map((items, i) => (
                    <td key={members[i].setupId}>
                      {items.length === 0 ? (
                        <span className="compare-cell-absent">—</span>
                      ) : (
                        items.map((item) => (
                          <span key={item.itemId} style={{ display: 'block' }}>
                            {pivot === 'channel' ? item.sourceName : item.channel != null ? `Ch ${item.channel}` : '—'}
                            {item.micLabel && <span className="compare-cell-sub">{item.micLabel}</span>}
                          </span>
                        ))
                      )}
                    </td>
                  ))}
                  <td style={{ position: 'relative', whiteSpace: 'nowrap' }}>
                    {!row.matched && (
                      <button
                        className="btn small"
                        onClick={() => setOpenRowKey(openRowKey === row.key ? null : row.key)}
                      >
                        Fix…
                      </button>
                    )}
                    {openRowKey === row.key && (
                      <div
                        className="picker-menu"
                        style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, minWidth: 200, zIndex: 5 }}
                      >
                        {row.cells.map((items, i) =>
                          items.length === 1 ? (
                            <div
                              key={members[i].setupId}
                              className="picker-menu-row"
                              onClick={() => align(row, i)}
                            >
                              Match {members[i].name}
                            </div>
                          ) : null
                        )}
                        {pivot === 'source' && (
                          <div className="picker-menu-row" onClick={() => toggleLink(row)}>
                            {(data.links ?? []).some((l) => l.linkKey === row.key)
                              ? 'Unlink these source names'
                              : linkFrom && linkFrom !== row.key
                                ? 'Link with the selected source'
                                : 'Link with another source…'}
                          </div>
                        )}
                        {pivot === 'source' && !linkFrom && (
                          <div
                            className="picker-menu-row"
                            onClick={() => {
                              setLinkFrom(row.key)
                              setOpenRowKey(null)
                            }}
                          >
                            Select this to link
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {unassignedCount > 0 && (
          <div className="card-sub" style={{ marginTop: 10 }}>
            {unassignedCount} row{unassignedCount === 1 ? '' : 's'} have no channel and aren&apos;t shown here.
          </div>
        )}
        {linkFrom && (
          <div className="card-sub" style={{ marginTop: 10 }}>
            Pick another source&apos;s Fix menu to link it with “{rows.find((r) => r.key === linkFrom)?.label}”.{' '}
            <button className="link-button" onClick={() => setLinkFrom(null)}>
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
