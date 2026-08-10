import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const SAFE_PATH = /^content\/posts\/\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.md$/
const HASH = /^[a-f0-9]{64}$/

export function readPendingReviewReceipts(filePath) {
  try {
    const entries = JSON.parse(readFileSync(filePath, 'utf8'))?.entries
    return Array.isArray(entries) ? entries.filter((entry) => SAFE_PATH.test(entry?.path) && HASH.test(entry?.contentVersion)) : []
  } catch { return [] }
}

export function writePendingReviewReceipt(filePath, receipt) {
  if (!SAFE_PATH.test(receipt?.path) || !HASH.test(receipt?.contentVersion)) return false
  const entries = readPendingReviewReceipts(filePath).filter((entry) => entry.path !== receipt.path)
  entries.push({ path: receipt.path, contentVersion: receipt.contentVersion })
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, `${JSON.stringify({ version: 1, entries }, null, 2)}\n`, 'utf8')
  return true
}

export function recheckPendingReviewReceipt({ filePath, adminSourceFresh, inspect }) {
  if (adminSourceFresh !== true) return null
  for (const receipt of readPendingReviewReceipts(filePath)) {
    const result = inspect(receipt.path)
    if (result?.reviewInput?.adminDiscoverability?.contentVersion === receipt.contentVersion) return { receipt, ...result }
  }
  return null
}
