import type { Metadata } from 'next'
import type { PostMeta } from './posts'
export { CATEGORY_URL_MAP } from './categories'

export const SITE_NAME = '三谷ファミリー歯科クリニック'
export const AUTHOR_NAME = '藍想会メディア編集部'

// canonical URL を組み立てるヘルパー
export function buildCanonicalUrl(path: string): string {
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`
}

// 検索エンジンにインデックスさせたくないページ用の metadata 断片
// 適用先: /contact, /privacy, /sitemap 等のユーティリティページ
export const NOINDEX_METADATA = {
  robots: { index: false, follow: true },
} as const

// 本番環境では NEXT_PUBLIC_SITE_URL または SITE_URL の設定が必須。
// - development: 未設定なら http://localhost:3000 にフォールバック
// - production : 未設定または localhost URL は即 throw（sitemap / OGP の誤出力を防ぐ）
function resolveSiteUrl(): string {
  const raw = (
    process.env.NEXT_PUBLIC_SITE_URL ?? process.env.SITE_URL ?? ''
  ).replace(/\/$/, '')

  if (process.env.NODE_ENV !== 'production') {
    return raw || 'http://localhost:3000'
  }

  // 本番環境: 未設定は hard error
  if (!raw) {
    throw new Error(
      '[seo.ts] 本番環境で NEXT_PUBLIC_SITE_URL が未設定です。' +
      ' Vercel の Environment Variables に NEXT_PUBLIC_SITE_URL を設定してください。' +
      ' 例: NEXT_PUBLIC_SITE_URL=https://example.com',
    )
  }

  // 本番環境: localhost URL は事故防止のため hard error
  if (/^https?:\/\/localhost/.test(raw)) {
    throw new Error(
      `[seo.ts] 本番環境に localhost URL が設定されています: "${raw}"。` +
      ' 本番用の URL に変更してください。',
    )
  }

  return raw
}
export const SITE_URL = resolveSiteUrl()

/**
 * 記事ページ用 Metadata を組み立てる。
 * OGP / canonical / article メタを含む。動的 OGP 画像は未実装のため og:image は省略。
 */
export function buildArticleMetadata(post: PostMeta, slug: string): Partial<Metadata> {
  const url = `${SITE_URL}/blog/${slug}`
  return {
    title: post.title,
    description: post.excerpt,
    alternates: { canonical: url },
    openGraph: {
      type: 'article',
      title: post.title,
      description: post.excerpt,
      url,
      siteName: SITE_NAME,
      publishedTime: `${post.date}T00:00:00Z`,
      // dateModified は別フィールドで管理していないため publishedTime と同値
      modifiedTime: `${post.date}T00:00:00Z`,
      authors: [AUTHOR_NAME],
      tags: post.tags,
    },
  }
}

/**
 * BlogPosting JSON-LD を組み立てる。
 *
 * 医療広告ガイドライン準拠のため以下は含めない:
 * - review / aggregateRating (効果の断定につながるため)
 * - medicalSpecialty (LocalBusiness と混同されやすいため今回は除外)
 * - FAQPage (乱用が多く Google の評価が低下傾向のため除外)
 */
export function buildBlogPostingJsonLd(post: PostMeta, slug: string) {
  const url = `${SITE_URL}/blog/${slug}`
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title.slice(0, 110),
    description: post.excerpt,
    author: {
      '@type': 'Organization',
      name: AUTHOR_NAME,
    },
    datePublished: `${post.date}T00:00:00Z`,
    dateModified: `${post.date}T00:00:00Z`,
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': url,
    },
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
    },
  }
}
