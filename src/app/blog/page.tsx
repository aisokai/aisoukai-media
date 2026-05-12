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
            {posts.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-gray-100 bg-white py-16 text-center shadow-sm">
                <p className="text-[15px] font-medium text-gray-500">現在公開中の記事はありません</p>
                <p className="mt-2 text-[13px] text-gray-400">近日公開予定の記事を準備しています</p>
              </div>
            ) : (
              <div className="grid gap-5 sm:grid-cols-2">
                {posts.map((post) => (
                  <ArticleCard key={post.slug} {...post} />
                ))}
              </div>
            )}
          </div>
          <aside className="shrink-0 lg:w-[300px]">
            <Sidebar />
          </aside>
        </div>
      </div>
    </>
  )
}
