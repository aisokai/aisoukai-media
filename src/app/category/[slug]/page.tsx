import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getAllPosts } from '@/lib/posts'
import { CATEGORY_SLUG_MAP } from '@/lib/categories'
import { buildCategoryMetadata } from '@/lib/seo'
import { ArticleCard } from '@/components/ArticleCard'
import { Sidebar } from '@/components/Sidebar'
import { HeroSection } from '@/components/HeroSection'

type Props = {
  params: Promise<{ slug: string }>
}

export function generateStaticParams() {
  return Object.keys(CATEGORY_SLUG_MAP).map((slug) => ({ slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const category = CATEGORY_SLUG_MAP[slug]
  if (!category) return {}
  return buildCategoryMetadata(category, slug)
}

export default async function CategoryPage({ params }: Props) {
  const { slug } = await params
  const category = CATEGORY_SLUG_MAP[slug]

  if (!category) return notFound()

  const posts = getAllPosts().filter((p) => p.category === category)

  return (
    <>
      <HeroSection
        title={category}
        description={`${category}に関する記事の一覧です`}
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
