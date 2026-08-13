import { createHash } from 'node:crypto'
import { closeSync, mkdirSync, openSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const RESERVATION_STALE_MS = 15 * 60 * 1000

function safePathPart(value) {
  return String(value ?? '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'unknown'
}

export function notificationDedupeKey({ date, job, text }) {
  const safeJob = safePathPart(job)
  const hash = createHash('sha256')
    .update(`${date}\0${job}\0${text}`)
    .digest('hex')
    .slice(0, 16)
  return `${safeJob}-${hash}`
}

export function reserveNotificationSend({ root, date, job, text, contentVersion }) {
  if (!root) throw new Error('root is required')
  if (!date) throw new Error('date is required')
  if (!job) throw new Error('job is required')
  if (!text) throw new Error('text is required')

  const versioned = typeof contentVersion === 'string' && /^[a-f0-9]{64}$/.test(contentVersion)
  const key = versioned
    ? `${safePathPart(job)}-${contentVersion}`
    : notificationDedupeKey({ date, job, text })
  const dir = versioned
    ? join(root, 'logs', 'notification-dedupe', 'content-versions')
    : join(root, 'logs', 'notification-dedupe', safePathPart(date))
  const path = join(dir, `${key}.json`)
  mkdirSync(dir, { recursive: true })

  const payload = {
    status: 'reserved',
    date,
    job,
    key,
    // Required to retry an interrupted reservation without reconstructing a
    // different article notification on a later scheduled invocation.
    text,
    ...(versioned ? { contentVersion } : {}),
    createdAt: new Date().toISOString(),
  }

  let fd = null
  try {
    fd = openSync(path, 'wx')
    writeFileSync(fd, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  } catch (error) {
    if (error?.code === 'EEXIST') {
      // Only a confirmed successful delivery suppresses the same article.
      // A failed or interrupted stale reservation is deliberately retried;
      // a fresh reservation remains in-flight to avoid concurrent duplicates.
      let existing = null
      try {
        existing = JSON.parse(readFileSync(path, 'utf8'))
        const reservedAt = Date.parse(existing.createdAt)
        const staleReserved = existing.status === 'reserved'
          && (!Number.isFinite(reservedAt) || Date.now() - reservedAt >= RESERVATION_STALE_MS)
        if (existing.status === 'failed' || staleReserved) {
          writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
          return makeReservation({ path, payload, key })
        }
      } catch {}
      return {
        shouldSend: false,
        reason: existing?.status === 'reserved' ? 'in-flight' : 'duplicate',
        key,
        path,
        release() {},
        commit() {},
      }
    }
    throw error
  } finally {
    if (fd !== null) closeSync(fd)
  }

  return makeReservation({ path, payload, key })
}

function makeReservation({ path, payload, key }) {
  let released = false
  return {
    shouldSend: true,
    reason: '',
    key,
    path,
    release() {
      if (released) return
      released = true
      try {
        unlinkSync(path)
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error
      }
    },
    commit(extra = {}) {
      if (released) return
      writeFileSync(path, `${JSON.stringify({
        ...payload,
        ...extra,
        status: 'sent',
        sentAt: new Date().toISOString(),
      }, null, 2)}\n`, 'utf8')
    },
    fail(extra = {}) {
      if (released) return
      writeFileSync(path, `${JSON.stringify({
        ...payload,
        ...extra,
        status: 'failed',
        failedAt: new Date().toISOString(),
      }, null, 2)}\n`, 'utf8')
    },
  }
}

export function readRetryableNotification({ root, job }) {
  const dir = join(root, 'logs', 'notification-dedupe', 'content-versions')
  try {
    for (const file of readdirSync(dir).sort()) {
      const value = JSON.parse(readFileSync(join(dir, file), 'utf8'))
      const reservedAt = Date.parse(value.createdAt)
      const retryableReservation = value.status === 'reserved'
        && (!Number.isFinite(reservedAt) || Date.now() - reservedAt >= RESERVATION_STALE_MS)
      if ((value.status === 'failed' || retryableReservation)
        && value.job === job && typeof value.contentVersion === 'string' && typeof value.text === 'string') {
        return value
      }
    }
  } catch {}
  return null
}
