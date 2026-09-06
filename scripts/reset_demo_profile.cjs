// Deletes the throwaway profile that `npm run dev:demo` uses, so the next launch is a genuine
// first run (onboarding, freshly seeded data, no setups).
//
// The guard matters more than the delete. An earlier version of this checked
// `pgrep -f 'Setup Sheet Helper (Demo)'`, which never matches: the running process is Electron and
// the profile path only ever appears in its ENVIRONMENT, not its argv. It therefore deleted a
// profile out from under a running app — the app survives on its open file handles, so nothing
// looks wrong until it quits and the data is gone. `lsof` on the database file is the check that
// actually answers "is anyone using this?".
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const dir = path.join(process.env.HOME, 'Library', 'Application Support', 'Setup Sheet Helper (Demo)')
const db = path.join(dir, 'setup-sheet-helper.sqlite')

if (!fs.existsSync(dir)) {
  console.log('Demo profile does not exist — nothing to reset.')
  process.exit(0)
}

let holders = ''
try {
  // lsof exits 1 when nothing has the file open, which is the common case, not an error.
  holders = execFileSync('lsof', ['--', db], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
} catch {
  holders = ''
}
if (holders.trim()) {
  console.error('The demo app still has this profile open — quit it first, then re-run.')
  console.error(holders.trim().split('\n').slice(0, 3).join('\n'))
  process.exit(1)
}

fs.rmSync(dir, { recursive: true, force: true })
console.log('Demo profile wiped. The next `npm run dev:demo` starts from a fresh install.')
