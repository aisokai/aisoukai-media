import type { MetadataRoute } from 'next'
import { getAllPosts } from '@/lib/posts'
import { SITE_URL, CATEGORY_URL_MAP } from '@/lib/seo'

export default function sitemap(): MetadataRoute.Sitemap {
  // getAllPosts() は reviewed:true && draft!==true の記事のみ返す（Approval Gate 済み）
  const posts = getAllPosts()

  // 公開済み記事に含まれるカテゴリだけを sitemap に含める（空カテゴリページを除外）
  const publishedCategories = [...new Set(posts.map((p) => p.category))]

  const staticPages: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`,        changeFrequency: 'daily',   priority: 1.0 },
    { url: `${SITE_URL}/blog`,    changeFrequency: 'daily',   priority: 0.9 },
    { url: `${SITE_URL}/about`,   changeFrequency: 'monthly', priority: 0.5 },
    { url: `${SITE_URL}/campaign/home-whitening-2026`, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${SITE_URL}/contact`, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${SITE_URL}/privacy`, changeFrequency: 'monthly', priority: 0.3 },
  ]

  const categoryPages: MetadataRoute.Sitemap = publishedCategories
    .filter((cat) => cat in CATEGORY_URL_MAP)
    .map((cat) => ({
      url: `${SITE_URL}/category/${CATEGORY_URL_MAP[cat]}`,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    }))

  const postPages: MetadataRoute.Sitemap = posts.map((post) => ({
    url: `${SITE_URL}/blog/${post.slug}`,
    lastModified: post.date,
    changeFrequency: 'monthly' as const,
    priority: 0.8,
  }))

  return [...staticPages, ...categoryPages, ...postPages]
}
