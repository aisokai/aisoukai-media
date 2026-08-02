import fs from 'fs'
import path from 'path'
import { readGitHubFile } from './githubContents'

export type ReviewLogEntry = {
  datetime: string
  timestamp: string
  action: 'approve' | 'reject' | 'rereview_required'
  slug: string
  reviewedBy?: string
  reason?: string
  rejectReason?: string
  date?: string
  publishAt?: string
}

const LOG_PATH = path.join(process.cwd(), 'logs', 'review-history.md')

function parseReviewLog(raw: string, limit: number): ReviewLogEntry[] {
  const blocks = raw.split(/^## /m).filter(Boolean)

  const entries: ReviewLogEntry[] = blocks.map((block) => {
    const lines = block.trim().split('\n')
    const headerDateTime = lines[0].trim()
    const fields: Record<string, string> = {}
    for (const line of lines.slice(1)) {
      const m = line.match(/^([a-z_]+):\s*(.+)$/)
      if (m) fields[m[1]] = m[2].trim()
    }
    const datetime = fields['datetime'] ?? headerDateTime
    return {
      datetime,
      timestamp: datetime,
      action:       (fields['action'] as ReviewLogEntry['action']) ?? 'approve',
      slug:         fields['slug'] ?? '',
      reviewedBy:   fields['reviewed_by'],
      reason:       fields['reason'] ?? fields['reject_reason'],
      rejectReason: fields['reject_reason'] ?? fields['reason'],
      date:         fields['date'],
      publishAt:    fields['publish_at'],
    }
  })

  return entries.reverse().slice(0, limit)
}

/** logs/review-history.md から最新 N 件のエントリを返す（新しい順）。ファイル不在時は空配列。 */
export function getRecentReviewLog(limit = 10): ReviewLogEntry[] {
  if (!fs.existsSync(LOG_PATH)) return []
  return parseReviewLog(fs.readFileSync(LOG_PATH, 'utf8'), limit)
}

export async function getRecentReviewLogForAdmin(limit = 10): Promise<ReviewLogEntry[]> {
  if (!process.env.GITHUB_REVIEW_TOKEN) return getRecentReviewLog(limit)

  try {
    const file = await readGitHubFile('logs/review-history.md')
    return parseReviewLog(file.content, limit)
  } catch (error) {
    console.error('GitHub review log read failed; falling back to local file', error)
    return getRecentReviewLog(limit)
  }
}
