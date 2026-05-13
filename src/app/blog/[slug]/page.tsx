import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Home, ChevronRight, Clock, Tag } from 'lucide-react'
import { getAllPosts, getPostBySlug } from '@/lib/posts'
import { buildArticleMetadata, buildBlogPostingJsonLd } from '@/lib/seo'
import { Sidebar } from '@/components/Sidebar'
import type { Metadata } from 'next'

const CATEGORY_COLORS: Record<string, string> = {
  "AI歯科": "#3b82f6",
  "虫歯治療": "#3b82f6",
  "根管治療": "#ef4444",
  "歯周病治療": "#f97316",
  "予防歯科": "#22c55e",
  "小児歯科": "#14b8a6",
  "矯正歯科": "#8b5cf6",
  "親知らずの抜歯": "#ec4899",
  "インプラント治療": "#0ea5e9",
  "訪問歯科": "#14b8a6",
  "医院からのお知らせ": "#8b5cf6",
}

export async function generateStaticParams() {
  const posts = getAllPosts()
  return posts.map((post) => ({ slug: post.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const post = await getPostBySlug(slug)
  if (!post) return {}
  return buildArticleMetadata(post, slug)
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const post = await getPostBySlug(slug)
  if (!post) notFound()

  const color = CATEGORY_COLORS[post.category] ?? '#6b7280'

  return (
    <>
      {/* BlogPosting JSON-LD — reviewed:true 記事のみここに到達するため未承認記事への挿入はない */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildBlogPostingJsonLd(post, slug)) }}
      />

      {/* Hero with breadcrumb */}
      <div className="bg-[#1e3a5f] py-8">
        <div className="mx-auto max-w-[1100px] px-4">
          <nav aria-label="パンくずリスト" className="mb-4 flex items-center gap-1 text-[12px] text-white/70">
            <Link href="/" className="flex items-center gap-1 hover:text-white">
              <Home className="h-3 w-3" />
              ホーム
            </Link>
            <ChevronRight className="h-3 w-3" />
            <Link href="/blog" className="hover:text-white">記事一覧</Link>
            <ChevronRight className="h-3 w-3" />
            <span className="text-white/50 line-clamp-1">{post.title}</span>
          </nav>
          <p className="text-[13px] font-medium text-white/80">{post.category}</p>
        </div>
      </div>

      {/* Main content */}
      <div className="mx-auto max-w-[1100px] px-4 py-8">
        <div className="flex flex-col gap-8 lg:flex-row">
          {/* Article */}
          <div className="min-w-0 flex-1">
            <article className="overflow-hidden rounded-lg bg-white shadow-sm">
              {/* Category color bar */}
              <div className="h-2 w-full" style={{ backgroundColor: color }} />
              <div className="p-6 md:p-8">
                {/* Meta */}
                <div className="mb-4 flex items-center gap-3 text-[12px] text-gray-400">
                  <span
                    className="rounded px-2 py-0.5 text-[11px] font-bold text-white"
                    style={{ backgroundColor: color }}
                  >
                    {post.category}
                  </span>
                  {!post.reviewed && (
                    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700">
                      未レビュー
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {post.date}
                  </span>
                </div>

                {/* Title */}
                <h1 className="mb-4 text-[22px] font-bold leading-snug text-gray-900 md:text-[26px]">
                  {post.title}
                </h1>

                {/* Hero image — image がある場合のみ表示。ない場合はカテゴリfallback（カラーバー）を維持 */}
                {post.image && (
                  <div className="relative mb-6 aspect-[16/9] overflow-hidden rounded-lg bg-gray-100">
                    <Image
                      src={post.image}
                      alt={post.imageAlt ?? post.title}
                      fill
                      className="object-cover"
                      priority
                    />
                  </div>
                )}

                {/* Description */}
                <div className="mb-6 border-l-4 border-[#1e3a5f] bg-blue-50 p-4">
                  <p className="text-[14px] leading-relaxed text-gray-600">{post.excerpt}</p>
                </div>

                {/* Tags */}
                {post.tags && post.tags.length > 0 && (
                  <div className="mb-6 flex flex-wrap items-center gap-2">
                    <Tag className="h-3.5 w-3.5 text-gray-400" />
                    {post.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-gray-100 px-3 py-0.5 text-[12px] text-gray-500"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Article body */}
                {/* eslint-disable-next-line react/no-danger */}
                <div
                  className="prose max-w-none"
                  dangerouslySetInnerHTML={{ __html: post.contentHtml }}
                />
              </div>
            </article>

            {/* Back link */}
            <div className="mt-6">
              <Link
                href="/blog"
                className="inline-flex items-center gap-1 text-[14px] text-[#1e3a5f] hover:underline"
              >
                <ChevronRight className="h-4 w-4 rotate-180" />
                記事一覧に戻る
              </Link>
            </div>
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
