import { app } from 'electron'
import { appendFileSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** Keep the log from growing without bound across a long-lived install. */
const MAX_BYTES = 2 * 1024 * 1024
const MAX_FILES = 3

let logPath: string | null = null

function rotateIfLarge(): void {
  if (!logPath) return
  try {
    if (statSync(logPath).size < MAX_BYTES) return
  } catch {
    return // no log yet — nothing to rotate
  }
  try {
    // main.log -> main.log.1 -> main.log.2 ..., dropping whatever falls off the end.
    rmSync(`${logPath}.${MAX_FILES}`, { force: true })
    for (let i = MAX_FILES - 1; i >= 1; i--) {
      try {
        renameSync(`${logPath}.${i}`, `${logPath}.${i + 1}`)
      } catch {
        // that rung doesn't exist yet
      }
    }
    renameSync(logPath, `${logPath}.1`)
  } catch {
    // Rotation is housekeeping; failing it must not stop logging.
  }
}

function write(level: string, args: unknown[]): void {
  if (!logPath) return
  const line = args
    .map((a) => {
      if (a instanceof Error) return a.stack ?? a.message
      if (typeof a === 'string') return a
      try {
        return JSON.stringify(a)
      } catch {
        return String(a)
      }
    })
    .join(' ')
  try {
    appendFileSync(logPath, `${new Date().toISOString()} [${level}] ${line}\n`)
  } catch {
    // Logging must never be the thing that breaks the app.
  }
}

/** Starts writing main-process diagnostics to userData/logs/main.log.
 *
 *  The app had no logging of any kind: no crashReporter, no uncaughtException handler, nothing.
 *  In a packaged build console.error goes nowhere a user can reach, so a broken auto-updater or a
 *  failing database was invisible to everyone — including whoever had to work out what went wrong
 *  from "it stopped working". Call once, as early in startup as possible.
 *
 *  Deliberately tiny and dependency-free. This is a breadcrumb trail to point at when something
 *  goes wrong, not telemetry: it stays on the user's disk and is never sent anywhere. */
export function initLogging(): void {
  try {
    const dir = join(app.getPath('userData'), 'logs')
    mkdirSync(dir, { recursive: true })
    logPath = join(dir, 'main.log')
    rotateIfLarge()
  } catch {
    logPath = null
    return
  }

  // Mirror rather than replace, so `npm run dev` still prints to the terminal.
  const consoleError = console.error.bind(console)
  const consoleWarn = console.warn.bind(console)
  console.error = (...args: unknown[]): void => {
    consoleError(...args)
    write('error', args)
  }
  console.warn = (...args: unknown[]): void => {
    consoleWarn(...args)
    write('warn', args)
  }

  process.on('uncaughtException', (err) => {
    write('fatal', ['uncaughtException', err])
    consoleError('[main] uncaughtException:', err)
  })
  process.on('unhandledRejection', (reason) => {
    write('fatal', ['unhandledRejection', reason])
    consoleError('[main] unhandledRejection:', reason)
  })

  write('info', [`--- ${app.getName()} ${app.getVersion()} started (${process.platform}) ---`])
}

/** Where the log lives, for the "something went wrong" dialog to point at. */
export function getLogPath(): string | null {
  return logPath
}
