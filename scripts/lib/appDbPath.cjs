// Resolves the app's live SQLite database — and refuses to guess.
//
// Every one-off script here used to hardcode `setup-sheet-helper` as the directory name. That is
// the PACKAGE name; Electron names its userData directory after `productName`, which is
// "Setup Sheet Helper". The lowercase directory is not imaginary — it is the profile from before
// the app was renamed, and it still holds an August 2026 database. So the mistake never failed
// loudly: a script would open the abandoned copy, do its work, print a cheerful summary, and
// leave the database the app actually reads untouched. That happened at least once, on
// 2026-09-06, during the gear-naming consolidation.
//
// better-sqlite3 CREATES a database when the file is missing, which is the other half of why a
// wrong path looks like success. Hence the existence check below: a script should stop, not
// silently invent an empty database and report zero rows changed.

const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs')

/** Must match package.json's `productName` — this is what Electron uses for userData. */
const APP_NAME = 'Setup Sheet Helper'
/** The filename itself still uses the package name (see src/main/userDataPaths.ts). */
const DB_FILE = 'setup-sheet-helper.sqlite'

function defaultDbPath() {
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', APP_NAME, DB_FILE)
  }
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || '', APP_NAME, DB_FILE)
  }
  return path.join(os.homedir(), '.config', APP_NAME, DB_FILE)
}

/** The database to work on: an explicit path when given, otherwise the app's live profile.
 *  Exits rather than handing back a path that does not exist. */
function resolveDbPath(explicitPath) {
  const dbPath = explicitPath ? path.resolve(explicitPath) : defaultDbPath()
  if (!fs.existsSync(dbPath)) {
    console.error(`No database at ${dbPath}`)
    console.error(
      explicitPath
        ? 'Check the path you passed.'
        : 'Pass a path explicitly if the app keeps its data somewhere else.'
    )
    process.exit(1)
  }
  return dbPath
}

/** Same, taking the first non-flag command-line argument as the explicit path, so every script
 *  can be pointed at a COPY for testing without each one growing its own argument parsing. */
function dbPathFromArgv(argv = process.argv.slice(2)) {
  return resolveDbPath(argv.find((arg) => !arg.startsWith('--')))
}

module.exports = { APP_NAME, DB_FILE, defaultDbPath, resolveDbPath, dbPathFromArgv }
