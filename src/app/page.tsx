import { getAllPosts } from '@/lib/posts'
import { ArticleCard } from '@/components/ArticleCard'
import { Sidebar } from '@/components/Sidebar'
import { FileText } from 'lucide-react'
import Link from 'next/link'

export default function Home() {
  const posts = getAllPosts()

  return (
    <>
      {/* Hero */}
      <div className="bg-[#1e3a5f] py-12">
        <div className="mx-auto max-w-[1100px] px-4">
          <h1 className="text-[28px] font-bold text-white">お口の健康情報メディア</h1>
          <p className="mt-2 text-[14px] text-white/80">三谷ファミリー歯科クリニックによる歯科情報メディア</p>
        </div>
      </div>

      {/* Main content */}
      <div className="mx-auto max-w-[1100px] px-4 py-8">
        <div className="flex flex-col gap-8 lg:flex-row">
          {/* Articles */}
          <div className="min-w-0 flex-1">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-[18px] font-bold text-gray-800">
                <FileText className="h-5 w-5 text-[#1e3a5f]" />
                最新記事
              </h2>
              {posts.length > 0 && (
                <span className="rounded-full bg-gray-100 px-3 py-1 text-[12px] font-medium text-gray-500">
                  全{posts.length}件
                </span>
              )}
            </div>
            {posts.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-gray-100 bg-white py-16 text-center shadow-sm">
                <p className="text-[15px] font-medium text-gray-500">記事は現在準備中です</p>
                <p className="mt-2 text-[13px] text-gray-400">近日公開予定の記事をご期待ください</p>
              </div>
            ) : (
              <>
                <div className="grid gap-5 sm:grid-cols-2">
                  {posts.slice(0, 6).map((post) => (
                    <ArticleCard key={post.slug} {...post} />
                  ))}
                </div>
                <div className="mt-8 flex justify-center">
                  <Link
                    href="/blog"
                    className="rounded-full border border-[#1e3a5f] px-8 py-2.5 text-[14px] font-medium text-[#1e3a5f] transition-colors hover:bg-[#1e3a5f] hover:text-white"
                  >
                    記事をもっと見る
                  </Link>
                </div>
              </>
            )}
          </div>

          {/* Sidebar */}
          <aside className="shrink-0 lg:w-[300px]">
            <Sidebar />
          </aside>
        </div>
      </div>
    </>
  )
}
