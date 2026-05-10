import { getAllPosts } from '@/lib/posts'
import { ArticleCard } from '@/components/ArticleCard'
import { Sidebar } from '@/components/Sidebar'
import { HeroSection } from '@/components/HeroSection'

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
