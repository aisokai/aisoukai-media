import type { Metadata } from 'next'
import { getAllPosts } from '@/lib/posts'
import { SITE_URL, SITE_NAME } from '@/lib/seo'
import { ArticleCard } from '@/components/ArticleCard'
import { Sidebar } from '@/components/Sidebar'
import { HeroSection } from '@/components/HeroSection'

export const metadata: Metadata = {
  title: '記事一覧',
  description: '三谷ファミリー歯科クリニックによる歯科情報メディア。虫歯・歯周病・予防歯科・訪問歯科など専門的な情報をわかりやすく解説します。',
  alternates: { canonical: `${SITE_URL}/blog` },
  openGraph: {
    type: 'website',
    title: '記事一覧',
    description: '三谷ファミリー歯科クリニックによる歯科情報メディア。虫歯・歯周病・予防歯科・訪問歯科など専門的な情報をわかりやすく解説します。',
    url: `${SITE_URL}/blog`,
    siteName: SITE_NAME,
  },
  twitter: {
    card: 'summary',
    title: '記事一覧',
    description: '三谷ファミリー歯科クリニックによる歯科情報メディア。虫歯・歯周病・予防歯科・訪問歯科など専門的な情報をわかりやすく解説します。',
  },
}

export default function BlogPage() {
  const posts = getAllPosts()

  return (
    <>
      <HeroSection
        title="記事一覧"
        description="歯科に関する専門的な情報をわかりやすくお届けします"
      />
      <div className="mx-auto max-w-[1100px] px-4 py-8">
        <div className="flex flex-col gap-8 lg:flex-row">
          <div className="min-w-0 flex-1">
            <div className="grid gap-5 sm:grid-cols-2">
              {posts.map((post) => (
                <ArticleCard key={post.slug} {...post} />
              ))}
            </div>
          </div>
          <aside className="shrink-0 lg:w-[300px]">
            <Sidebar />
          </aside>
        </div>
      </div>
    </>
  )
}
