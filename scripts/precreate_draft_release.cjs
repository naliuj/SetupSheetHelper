// Ensures exactly one GitHub draft release exists for the current package.json version, before
// electron-builder gets there.
//
// Why: `release:mac` builds arm64 and x64 as two separate publish passes. Each checks whether the
// release exists and creates it if not, and those checks race — both decide it is missing, both
// create one, and the assets end up split across two drafts with `gh release view`/`upload`
// resolving by tag picking whichever it likes. That needed manual repair on 1.16.0 and 1.16.1.
// With the draft already there, both passes find it and upload into the same release.
//
// The awkward part: a draft has no real git tag yet (GitHub calls it `untagged-<hash>` until
// publication), so `gh release create` will happily make a second draft for a tag that already has
// one. Nothing errors. That is the same reason electron-builder can race in the first place, and it
// means this script cannot just create-and-hope either. So it re-reads after creating and deletes
// any extras: the releases list is eventually consistent, and a read taken immediately after a
// write can miss it, which is exactly how an earlier version of this script produced the duplicate
// it was written to prevent.
//
// Idempotent and safe to re-run, including after a failed build.
//
// Usage: node scripts/precreate_draft_release.cjs   (run automatically by `npm run release:mac`)

const { execFileSync } = require('node:child_process')
const { version } = require('../package.json')

const TAG = `v${version}`
const REPO = 'naliuj/SetupSheetHelper'
/** Long enough for the releases list to reflect a create we just made. */
const SETTLE_MS = 3000

function gh(args) {
  return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

/** Every release carrying our tag, newest id last. Published ones count: if the version is already
 *  out, that is a problem to surface rather than pile a draft on top of. */
function releasesForTag() {
  const raw = gh([
    'api',
    `repos/${REPO}/releases`,
    '--cache',
    '0',
    '--jq',
    `[.[] | select(.tag_name=="${TAG}") | {id, draft, assets: ([.assets[].name] | length)}]`
  ])
  return JSON.parse(raw).sort((a, b) => a.id - b.id)
}

function sleep(ms) {
  execFileSync('sleep', [String(ms / 1000)])
}

try {
  gh(['--version'])
} catch {
  console.error('gh CLI not found — skipping draft pre-creation. Check `gh release list` afterwards.')
  process.exit(0)
}

let existing
try {
  existing = releasesForTag()
} catch (err) {
  console.error(`Could not list releases (${err.message.trim()}). Continuing without pre-creation.`)
  process.exit(0)
}

const published = existing.filter((r) => !r.draft)
if (published.length > 0) {
  console.error(`${TAG} is already published. Bump the version, or delete that release first.`)
  process.exit(1)
}

if (existing.length === 0) {
  // --notes "" rather than --generate-notes: the changelog users actually read lives in
  // src/shared/constants/changelog.ts and ships inside the app.
  gh(['release', 'create', TAG, '--repo', REPO, '--draft', '--title', version, '--notes', ''])
  sleep(SETTLE_MS)
  existing = releasesForTag()
}

// Keep the oldest, and whichever already holds assets if a build got partway. Delete the rest.
if (existing.length > 1) {
  const keep = existing.find((r) => r.assets > 0) ?? existing[0]
  for (const release of existing) {
    if (release.id === keep.id) continue
    gh(['api', '-X', 'DELETE', `repos/${REPO}/releases/${release.id}`])
    console.log(`Removed duplicate draft ${release.id} for ${TAG}.`)
  }
  existing = [keep]
}

console.log(`Draft release ${TAG} ready (id ${existing[0].id}, ${existing[0].assets} assets).`)
