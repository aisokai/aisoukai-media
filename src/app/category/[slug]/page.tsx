import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getAllPosts } from '@/lib/posts'
import { ArticleCard } from '@/components/ArticleCard'
import { Sidebar } from '@/components/Sidebar'
import { HeroSection } from '@/components/HeroSection'

const CATEGORY_SLUG_MAP: Record<string, string> = {
  'cavity':       '虫歯治療',
  'root-canal':   '根管治療',
  'periodontal':  '歯周病治療',
  'preventive':   '予防歯科',
  'pediatric':    '小児歯科',
  'wisdom-tooth': '親知らず',
  'implant':      'インプラント',
  'other':        'その他',
  'news':         'お知らせ',
}

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
  return {
    title: `${category}の記事一覧 | 三谷ファミリー歯科クリニック`,
    description: `${category}に関する記事の一覧ページです。歯科の専門情報をわかりやすくお届けします。`,
  }
}

export default async function CategoryPage({ params }: Props) {
  const { slug } = await params
  const category = CATEGORY_SLUG_MAP[slug]

  if (!category) notFound()

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
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <p className="text-[15px] font-medium text-gray-500">まだ記事がありません</p>
                <p className="mt-2 text-[13px] text-gray-400">近日公開予定です。しばらくお待ちください。</p>
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
