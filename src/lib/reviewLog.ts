import fs from 'fs'
import path from 'path'

export type ReviewLogEntry = {
  timestamp: string
  action: 'approve' | 'reject'
  slug: string
  reviewedBy?: string
  reason?: string
  date?: string
  publishAt?: string
}

const LOG_PATH = path.join(process.cwd(), 'logs', 'review-history.md')

/** logs/review-history.md から最新 N 件のエントリを返す（新しい順）。ファイル不在時は空配列。 */
export function getRecentReviewLog(limit = 10): ReviewLogEntry[] {
  if (!fs.existsSync(LOG_PATH)) return []

  const raw = fs.readFileSync(LOG_PATH, 'utf8')
  const blocks = raw.split(/^## /m).filter(Boolean)

  const entries: ReviewLogEntry[] = blocks.map((block) => {
    const lines = block.trim().split('\n')
    const timestamp = lines[0].trim()
    const fields: Record<string, string> = {}
    for (const line of lines.slice(1)) {
      const m = line.match(/^([a-z_]+):\s*(.+)$/)
      if (m) fields[m[1]] = m[2].trim()
    }
    return {
      timestamp,
      action:     (fields['action'] as 'approve' | 'reject') ?? 'approve',
      slug:       fields['slug'] ?? '',
      reviewedBy: fields['reviewed_by'],
      reason:     fields['reason'],
      date:       fields['date'],
      publishAt:  fields['publish_at'],
    }
  })

  return entries.reverse().slice(0, limit)
}
