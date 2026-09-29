'use strict'

// Loads the native haptics addon when there is one, and falls back to a no-op when there isn't —
// any platform but macOS, or a build that failed. Haptics are a nicety; a missing binary must never
// stop the app from starting.
const PATTERNS = { generic: 0, alignment: 1, levelChange: 2 }

let native = null
if (process.platform === 'darwin') {
  try {
    native = require('./build/Release/haptics.node')
  } catch {
    native = null
  }
}

module.exports = {
  /** True when the addon loaded, so perform() can actually reach the Taptic Engine. */
  available: native != null,
  /** @param {'generic' | 'alignment' | 'levelChange'} pattern */
  perform(pattern) {
    const code = PATTERNS[pattern]
    if (native && code !== undefined) native.perform(code)
  }
}
