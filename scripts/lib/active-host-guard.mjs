// Active-host ownership guard for resident (launchd) jobs.
//
// docs/ops/active-host.md declares which machine owns the resident jobs
// (`- current: <host-id>`). Each resident entry script calls
// assertActiveHost() before doing any real work:
//
//   - current == this host's id          → return, the job proceeds
//   - current == another KNOWN host id   → one log line, process exits with code 0
//   - anything the guard cannot decide   → FAIL-SAFE: one note line, the job proceeds
//     (file missing/unreadable, no or ambiguous `current:`, unknown current value,
//      this hostname not in the mapping table, or any unexpected error)
//
// The guard must never stop a job because of its own failure.
//
// Test/ops overrides (environment variables):
//   ACTIVE_HOST_FILE  path to the declaration file (default <rootDir>/docs/ops/active-host.md)
//   ACTIVE_HOST_ID    this machine's host id, bypassing the os.hostname() mapping
//                     (ignored unless it is one of KNOWN_HOST_IDS)
import { readFileSync } from 'node:fs'
import { hostname as osHostname } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// os.hostname() (lowercased, trailing ".local" removed) → host id used in active-host.md.
export const HOST_ID_BY_HOSTNAME = Object.freeze({
  // Mac mini: os.hostname() === 'caelus-mini.local' (confirmed 2026-11-08)
  'caelus-mini': 'mac-mini',
  // PLACEHOLDER — MacBook hostname is NOT confirmed yet. Replace this key with the
  // MacBook's normalized os.hostname() value. Until then the MacBook is an
  // "unknown hostname" and the guard fail-safes to "job proceeds" there.
  '__unconfirmed_macbook_hostname__': 'macbook-pro',
})

export const KNOWN_HOST_IDS = Object.freeze([...new Set(Object.values(HOST_ID_BY_HOSTNAME))])

const PREFIX = '[active-host-guard]'
const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const HOST_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/

export function normalizeHostname(name) {
  return String(name ?? '').trim().toLowerCase().replace(/\.local\.?$/, '')
}

// Returns the single `current:` value, or null when absent, ambiguous or malformed.
export function parseCurrentHost(text) {
  const values = [...String(text).matchAll(/^[ \t]*(?:[-*][ \t]+)?current[ \t]*:[ \t]*(.*?)[ \t]*$/gim)]
    .map((m) => m[1].replace(/^[`'"]+|[`'"]+$/g, '').trim().toLowerCase())
  const unique = [...new Set(values)]
  if (unique.length !== 1 || !HOST_ID_PATTERN.test(unique[0])) return null
  return unique[0]
}

function resolveThisHostId(env, hostnameFn) {
  const override = String(env.ACTIVE_HOST_ID ?? '').trim().toLowerCase()
  // An override that is not a known host id is ignored (fail-safe: a stray value must not stop a job).
  if (override && KNOWN_HOST_IDS.includes(override)) return { hostId: override, source: 'ACTIVE_HOST_ID' }
  const name = normalizeHostname(hostnameFn())
  return { hostId: Object.hasOwn(HOST_ID_BY_HOSTNAME, name) ? HOST_ID_BY_HOSTNAME[name] : null, source: name }
}

/**
 * Decide whether this host owns the resident jobs. Never throws.
 * @returns {{ proceed: boolean, reason: string, current?: string, hostId?: string }}
 */
export function checkActiveHost({ rootDir = DEFAULT_ROOT, env = process.env, hostname = osHostname, readFile = readFileSync } = {}) {
  try {
    const file = String(env.ACTIVE_HOST_FILE ?? '').trim() || join(rootDir, 'docs', 'ops', 'active-host.md')
    let text
    try { text = readFile(file, 'utf8') } catch { return { proceed: true, reason: 'file_unreadable' } }
    const current = parseCurrentHost(text)
    if (!current) return { proceed: true, reason: 'current_unparseable' }
    if (!KNOWN_HOST_IDS.includes(current)) return { proceed: true, reason: 'current_unknown_host_id', current }
    const { hostId, source } = resolveThisHostId(env, hostname)
    if (!hostId) return { proceed: true, reason: 'hostname_not_mapped', current, hostname: source }
    if (hostId === current) return { proceed: true, reason: 'active_owner', current, hostId }
    return { proceed: false, reason: 'not_active_owner', current, hostId }
  } catch {
    return { proceed: true, reason: 'guard_error' }
  }
}

/**
 * Call at the very top of a resident job entry, before any real work.
 * Returns true when the job should proceed; otherwise logs one line and exits 0.
 * `exit` and `log` are injectable for tests.
 */
export function assertActiveHost({ rootDir, env, hostname, readFile, exit = (code) => process.exit(code), log = (line) => console.error(line) } = {}) {
  const result = checkActiveHost({ rootDir, env, hostname, readFile })
  if (!result.proceed) {
    log(`${PREFIX} this host is not the active owner (current: ${result.current}, this host: ${result.hostId}); exiting`)
    exit(0)
    return false
  }
  if (result.reason !== 'active_owner') {
    try { log(`${PREFIX} note: ownership not verified (${result.reason}); proceeding as before`) } catch { /* never block the job */ }
  }
  return true
}
