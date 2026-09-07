import { SITE_ORIGIN, STUDIO_LIBRARY_INDEX_URL } from '@shared/constants/urls'
import type {
  ExportedStudio,
  LibraryStudio,
  StudioExportFile,
  StudioLibraryIndexResult,
  StudioLibraryPacksResult
} from '@shared/types/ipc'

const EXPORT_VERSION = 3

/** Long enough for a big pack on a slow connection, short enough that a dead server does not leave
 *  the picker spinning forever. Nothing else in main has a request timeout, so this is the first. */
const REQUEST_TIMEOUT_MS = 20_000

/** Layout PDFs ride along as base64, so packs are by far the largest thing the app ingests. The
 *  biggest published today is ~420 KB; this leaves plenty of headroom while still refusing
 *  something that would exhaust memory. */
const MAX_INDEX_BYTES = 2 * 1024 * 1024
const MAX_PACK_BYTES = 25 * 1024 * 1024

/** Every request goes through here so the timeout, the size cap and the "never throw" contract are
 *  applied uniformly. Returns the parsed JSON, or a message fit to show a user. */
async function fetchJson(url: string, maxBytes: number): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    })
    if (!response.ok) {
      return { ok: false, error: `The server returned ${response.status} for ${url}.` }
    }

    // Trust the header only as an early out; the real cap is on the body we actually read, since
    // Content-Length is optional and can lie.
    const declared = Number(response.headers.get('content-length'))
    if (Number.isFinite(declared) && declared > maxBytes) {
      return { ok: false, error: 'That download is larger than this app will accept.' }
    }

    const body = await response.arrayBuffer()
    if (body.byteLength > maxBytes) {
      return { ok: false, error: 'That download is larger than this app will accept.' }
    }

    return { ok: true, data: JSON.parse(new TextDecoder().decode(body)) }
  } catch (err) {
    // AbortSignal.timeout rejects with a TimeoutError; everything else is a network or parse fault.
    if (err instanceof Error && err.name === 'TimeoutError') {
      return { ok: false, error: 'The studio library took too long to respond. Check your connection and try again.' }
    }
    if (err instanceof SyntaxError) {
      return { ok: false, error: 'The studio library sent something this app could not read.' }
    }
    return { ok: false, error: 'Could not reach the studio library. Check your connection and try again.' }
  }
}

function isLibraryStudio(value: unknown): value is LibraryStudio {
  if (typeof value !== 'object' || value === null) return false
  const entry = value as Record<string, unknown>
  const counts = entry.counts as Record<string, unknown> | undefined
  return (
    typeof entry.id === 'string' &&
    typeof entry.name === 'string' &&
    typeof entry.city === 'string' &&
    typeof entry.file === 'string' &&
    typeof entry.bytes === 'number' &&
    typeof entry.roomLayout === 'boolean' &&
    typeof counts === 'object' &&
    counts !== null &&
    typeof counts.mics === 'number' &&
    typeof counts.outboard === 'number' &&
    typeof counts.preamps === 'number'
  )
}

/** Resolves a manifest-supplied path against the site and refuses anything that leaves it. The
 *  manifest is remote content, so an absolute URL in `file` would otherwise let it point the app at
 *  a host of its choosing. */
function resolveWithinSite(file: string): string | null {
  try {
    const url = new URL(file, `${SITE_ORIGIN}/`)
    return url.origin === new URL(SITE_ORIGIN).origin ? url.toString() : null
  } catch {
    return null
  }
}

export async function fetchStudioLibraryIndex(): Promise<StudioLibraryIndexResult> {
  const result = await fetchJson(STUDIO_LIBRARY_INDEX_URL, MAX_INDEX_BYTES)
  if (!result.ok) return result

  const parsed = result.data as { studios?: unknown }
  if (!Array.isArray(parsed.studios)) {
    return { ok: false, error: 'The studio library index is not in a format this app understands.' }
  }

  // Drop malformed entries rather than failing the whole list: one bad row on the site should not
  // make the feature unusable.
  const studios = parsed.studios.filter(isLibraryStudio).filter((s) => resolveWithinSite(s.file) !== null)
  return { ok: true, studios }
}

/** Downloads the named packs and flattens them into one importable list, in the order given.
 *  `files` are manifest `file` values, not arbitrary URLs. */
export async function fetchStudioLibraryPacks(files: string[]): Promise<StudioLibraryPacksResult> {
  const urls: string[] = []
  for (const file of files) {
    const url = resolveWithinSite(file)
    if (!url) return { ok: false, error: 'The studio library pointed somewhere unexpected. Nothing was downloaded.' }
    urls.push(url)
  }

  const results = await Promise.all(urls.map((url) => fetchJson(url, MAX_PACK_BYTES)))

  const studios: ExportedStudio[] = []
  for (const result of results) {
    if (!result.ok) return result
    const pack = result.data as Partial<StudioExportFile>
    if (typeof pack.version !== 'number' || !Array.isArray(pack.studios)) {
      return { ok: false, error: 'One of those studios is not a valid export. Nothing was imported.' }
    }
    if (pack.version > EXPORT_VERSION) {
      return {
        ok: false,
        error: `One of those studios needs a newer version of Setup Sheet Helper (format ${pack.version}).`
      }
    }
    studios.push(...pack.studios)
  }

  return { ok: true, file: { version: EXPORT_VERSION, studios } }
}
