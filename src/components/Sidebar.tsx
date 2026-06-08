import Link from 'next/link'
import Image from 'next/image'
import { Search, TrendingUp, FolderOpen, User, ChevronRight } from 'lucide-react'
import { getAllPosts } from '@/lib/posts'

// カテゴリのナビゲーション定義（順序・色・URLの正本）
const CATEGORY_NAV = [
  { name: "虫歯治療",      color: "#3b82f6", href: "/category/cavity" },
  { name: "根管治療",      color: "#ef4444", href: "/category/root-canal" },
  { name: "歯周病治療",    color: "#f97316", href: "/category/periodontal" },
  { name: "予防歯科",      color: "#22c55e", href: "/category/preventive" },
  { name: "小児歯科",      color: "#14b8a6", href: "/category/pediatric" },
  { name: "矯正歯科",      color: "#8b5cf6", href: "/category/orthodontics" },
  { name: "親知らずの抜歯", color: "#ec4899", href: "/category/wisdom-tooth" },
  { name: "インプラント治療",color: "#0ea5e9", href: "/category/implant" },
  { name: "その他",        color: "#6b7280", href: "/category/other" },
]

const CATEGORY_COLORS: Record<string, string> = {
  "AI歯科": "#3b82f6",
  "虫歯治療": "#3b82f6",
  "根管治療": "#ef4444",
  "歯周病治療": "#f97316",
  "予防歯科": "#22c55e",
  "小児歯科": "#14b8a6",
  "矯正歯科": "#8b5cf6",
  "親知らずの抜歯": "#ec4899",
  "親知らず": "#ec4899",
  "インプラント治療": "#0ea5e9",
  "インプラント": "#0ea5e9",
  "訪問歯科": "#14b8a6",
  "お知らせ": "#8b5cf6",
}

function rankColor(rank: number): string {
  if (rank === 1) return 'bg-[#fbbf24]'
  if (rank === 2) return 'bg-[#9ca3af]'
  if (rank === 3) return 'bg-[#cd7f32]'
  return 'bg-gray-300'
}

function SidebarSection({
  icon: Icon,
  title,
  children
}: {
  icon: React.ElementType
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="overflow-hidden rounded-lg bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-gray-100 bg-[#1e3a5f] px-4 py-3">
        <Icon className="h-4 w-4 text-white" />
        <h3 className="text-[14px] font-bold text-white">{title}</h3>
      </div>
      <div className="p-4">
        {children}
      </div>
    </div>
  )
}

export function Sidebar() {
  const posts = getAllPosts()
  const popularPosts = posts.slice(0, 5)

  // 公開済み記事（getAllPosts が Approval Gate 済みのみ返す）のカテゴリ別件数
  const countByCategory = posts.reduce<Record<string, number>>((acc, p) => {
    acc[p.category] = (acc[p.category] ?? 0) + 1
    return acc
  }, {})

  const categories = CATEGORY_NAV.map((c) => ({
    ...c,
    count: countByCategory[c.name] ?? 0,
  }))

  return (
    <div className="flex flex-col gap-6">
      {/* 記事を検索 */}
      <SidebarSection icon={Search} title="記事を検索">
        <div className="relative">
          <input
            type="text"
            placeholder="キーワードを入力"
            className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 pr-10 text-[13px] placeholder:text-gray-400 focus:border-[#1e3a5f] focus:bg-white focus:outline-none"
          />
          <button
            type="button"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#1e3a5f]"
            aria-label="検索"
          >
            <Search className="h-4 w-4" />
          </button>
        </div>
      </SidebarSection>

      {/* 人気の記事 */}
      <SidebarSection icon={TrendingUp} title="人気の記事">
        <div className="flex flex-col">
          {popularPosts.map((post, index) => {
            const rank = index + 1
            const color = CATEGORY_COLORS[post.category] ?? '#6b7280'
            return (
              <Link
                key={post.slug}
                href={`/blog/${post.slug}`}
                className={`group flex items-start gap-3 py-3 ${
                  index !== popularPosts.length - 1 ? 'border-b border-gray-100' : ''
                }`}
              >
                {/* ランクバッジ */}
                <div
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded text-[12px] font-bold text-white ${rankColor(rank)}`}
                >
                  {rank}
                </div>
                {/* サムネイル: image があれば実画像、なければカテゴリカラー */}
                {post.image ? (
                  <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded">
                    <Image
                      src={post.image}
                      alt={post.imageAlt ?? post.title}
                      fill
                      className="object-cover"
                    />
                  </div>
                ) : (
                  <div
                    className="h-14 w-14 shrink-0 rounded"
                    style={{ backgroundColor: color }}
                    aria-hidden="true"
                  />
                )}
                {/* タイトル */}
                <p className="flex-1 text-[13px] leading-snug text-gray-700 group-hover:text-[#1e3a5f]">
                  {post.title}
                </p>
              </Link>
            )
          })}
        </div>
      </SidebarSection>

      {/* カテゴリ */}
      <SidebarSection icon={FolderOpen} title="カテゴリ">
        <div className="flex flex-col">
          {categories.map((category, index) => (
            <Link
              key={category.name}
              href={category.href}
              className={`group flex items-center justify-between py-2.5 ${
                index !== categories.length - 1 ? 'border-b border-gray-100' : ''
              }`}
            >
              <span className="flex items-center gap-2">
                <span
                  className="h-3 w-3 rounded"
                  style={{ backgroundColor: category.color }}
                />
                <span className="text-[13px] text-gray-700 group-hover:text-[#1e3a5f]">
                  {category.name}
                </span>
              </span>
              <span className="flex items-center gap-1 text-[12px] text-gray-400">
                {category.count}件
                <ChevronRight className="h-3 w-3" />
              </span>
            </Link>
          ))}
        </div>
      </SidebarSection>

      {/* この記事を書いた人 */}
      <SidebarSection icon={User} title="この記事を書いた人">
        <div className="flex flex-col items-center text-center">
          <div className="relative mb-3 h-24 w-24 overflow-hidden rounded-full border border-gray-100 bg-white shadow-sm">
            <Image
              src="/images/clinic-logo.png"
              alt="三谷ファミリー歯科クリニックのロゴ"
              fill
              sizes="96px"
              className="object-contain p-2"
            />
          </div>
          <p className="mb-1 text-[13px] text-gray-500">医療法人藍想会</p>
          <p className="mb-3 text-[15px] font-bold text-gray-800">三谷ファミリー歯科クリニック</p>
          <p className="text-[12px] leading-[1.8] text-gray-500">
            徳島県で歯科診療・訪問歯科診療を行っています。お口の健康、予防、通院が難しい方への歯科支援について、わかりやすく情報をお届けします。
          </p>
        </div>
      </SidebarSection>
    </div>
  )
}
