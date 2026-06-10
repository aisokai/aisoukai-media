const FALLBACK_SITE_URL = 'https://aisoukai-media.vercel.app'

export function resolveNotificationSiteUrl(env = process.env) {
  const raw = env.SITE_URL ?? env.NEXT_PUBLIC_SITE_URL ?? env.VERCEL_URL ?? ''
  const cleaned = String(raw).trim().replace(/\/$/, '')
  if (!cleaned) return FALLBACK_SITE_URL
  const withScheme = /^https?:\/\//.test(cleaned) ? cleaned : `https://${cleaned}`
  const hostname = new URL(withScheme).hostname
  if (hostname === 'example.com' || hostname.endsWith('.example.com')) return FALLBACK_SITE_URL
  if (hostname === 'localhost' || hostname === '127.0.0.1') return FALLBACK_SITE_URL
  return withScheme
}

