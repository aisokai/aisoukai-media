const FALLBACK_SITE_URL = 'https://aisoukai-media.vercel.app'

function normalizeSiteUrl(raw) {
  const value = String(raw ?? '').trim()
  if (!value) return FALLBACK_SITE_URL

  const withProtocol = /^https?:\/\//.test(value) ? value : `https://${value}`
  try {
    const url = new URL(withProtocol)
    if (url.hostname === 'localhost' || url.hostname.endsWith('.localhost')) {
      return FALLBACK_SITE_URL
    }
    if (url.hostname === 'example.com' || url.hostname.endsWith('.example.com')) {
      return FALLBACK_SITE_URL
    }
    return url.origin
  } catch {
    return FALLBACK_SITE_URL
  }
}

export function resolveApprovalNotificationSiteUrl(env = process.env) {
  return normalizeSiteUrl(env.NEXT_PUBLIC_SITE_URL ?? env.VERCEL_URL)
}

function shortSha(commitSha) {
  return String(commitSha ?? '').slice(0, 7)
}

function effectivePublishDate({ publishDate, date }) {
  return String(publishDate ?? date ?? '').slice(0, 10)
}

export function buildPostApprovalNotification({
  title,
  slug,
  reviewedBy,
  commitSha,
  publishDate,
  date,
  today,
  env = process.env,
}) {
  const siteUrl = resolveApprovalNotificationSiteUrl(env)
  const effectiveDate = effectivePublishDate({ publishDate, date })
  const lines = [
    '✅ 記事を承認しました',
    '',
    `- ${title || '（タイトル未設定）'}${effectiveDate ? `（${effectiveDate}）` : ''}`,
    `承認者: ${reviewedBy}`,
  ]

  const sha = shortSha(commitSha)
  if (sha) lines.push(`GitHub commit: ${sha}`)
  if (effectiveDate) lines.push(`公開予定日: ${effectiveDate}`)
  if (effectiveDate && today && effectiveDate > today) {
    lines.push('公開予定日まではサイト上では非公開です。')
  }
  lines.push('', '公開ページ:', `${siteUrl}/blog/${slug}`)

  return lines.join('\n')
}

export async function notifyPostApprovedTelegram() {
  // Third-party transfer stays hard-disabled until a separate, non-forgeable
  // transport boundary is introduced under an explicit Human Gate.
  return false
}
