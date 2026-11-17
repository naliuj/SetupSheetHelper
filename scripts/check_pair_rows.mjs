// Checks the stereo-pair row rules (src/renderer/src/state/pairRows.ts): duplicating rows never
// chains or splits a linked pair, and a dragged row never lands between a pair's two halves.
// Run with `node scripts/check_pair_rows.mjs`; exits non-zero on any failure.

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { buildSync } from 'esbuild'

const root = fileURLToPath(new URL('..', import.meta.url))
const dir = mkdtempSync(join(tmpdir(), 'pair-rows-'))
const out = join(dir, 'pairRows.mjs')
buildSync({ entryPoints: [join(root, 'src/renderer/src/state/pairRows.ts')], bundle: true, format: 'esm', outfile: out, logLevel: 'error' })
const { duplicateRows, avoidSplittingPair } = await import(pathToFileURL(out).href)
rmSync(dir, { recursive: true, force: true })

// Rows written as "A" (unlinked) or "B1:b" (linked in group b).
const rows = (spec) => spec.split(' ').map((s) => { const [id, g] = s.split(':'); return { id, groupId: g ?? null } })
const show = (items) => items.map((r) => (r.groupId ? `${r.id}:${r.groupId}` : r.id)).join(' ')

let failures = 0
function check(name, got, expected) {
  const ok = got === expected
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      expected ${expected}\n      got      ${got}`}`)
}

function dup(spec, ids) {
  let n = 0
  return show(duplicateRows(rows(spec), ids, (r, groupId) => ({ id: `${r.id}'`, groupId }), () => `n${++n}`).items)
}

check('bottom half of a pair copies unlinked, after the pair', dup('A B1:b B2:b C', ['B2']), "A B1:b B2:b B2' C")
check('top half of a pair copies after the pair, not between', dup('A B1:b B2:b C', ['B1']), "A B1:b B2:b B1' C")
check('a whole pair copies as a new pair after it', dup('A B1:b B2:b C', ['B1', 'B2']), "A B1:b B2:b B1':n1 B2':n1 C")
check('two pairs copy as two new pairs, not a chain', dup('A1:a A2:a B1:b B2:b', ['A1', 'A2', 'B1', 'B2']), "A1:a A2:a B1:b B2:b A1':n1 A2':n1 B1':n2 B2':n2")
check('separate selections copy after each run', dup('A B C', ['A', 'C']), "A A' B C C'")

const move = (spec, moved, down) => show(avoidSplittingPair(rows(spec), new Set(moved), down))
check('row dropped between halves moving down goes past the partner', move('P1:p R P2:p', ['R'], true), 'P1:p P2:p R')
check('row dropped between halves moving up goes above the pair', move('P1:p R P2:p', ['R'], false), 'R P1:p P2:p')
check('a moved pair dropped inside another pair moves out', move('A1:a B1:b B2:b A2:a', ['B1', 'B2'], true), 'A1:a A2:a B1:b B2:b')
check('a drop between unrelated rows is unchanged', move('A R B', ['R'], true), 'A R B')
check('a drop at the very top is unchanged', move('R P1:p P2:p', ['R'], false), 'R P1:p P2:p')

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.')
process.exit(failures ? 1 : 0)
