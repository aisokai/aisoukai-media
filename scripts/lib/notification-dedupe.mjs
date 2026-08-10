import { createHash } from 'node:crypto'
import { closeSync, mkdirSync, openSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

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
    ...(versioned ? { contentVersion } : {}),
    createdAt: new Date().toISOString(),
  }

  let fd = null
  try {
    fd = openSync(path, 'wx')
    writeFileSync(fd, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  } catch (error) {
    if (error?.code === 'EEXIST') {
      return {
        shouldSend: false,
        reason: 'duplicate',
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
  }
}
