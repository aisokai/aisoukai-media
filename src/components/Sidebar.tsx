import Link from 'next/link'
import { Search, FileText, FolderOpen, User, ChevronRight } from 'lucide-react'
import { getAllPosts } from '@/lib/posts'

// カテゴリ一覧（静的定義）
const categories = [
  { name: "予防歯科", count: 15, color: "#22c55e", href: "/category/preventive" },
  { name: "訪問歯科", count: 8, color: "#14b8a6", href: "/category/home-visit" },
  { name: "小児歯科", count: 9, color: "#f97316", href: "/category/pediatric" },
  { name: "医院からのお知らせ", count: 4, color: "#8b5cf6", href: "/category/news" },
]

// ランクバッジの色: 1位=金、2位=銀、3位=銅、4〜5位=グレー
function rankColor(rank: number): string {
  if (rank === 1) return 'bg-[#fbbf24]'
  if (rank === 2) return 'bg-[#9ca3af]'
  if (rank === 3) return 'bg-[#cd7f32]'
  return 'bg-gray-300'
}

// セクション共通ラッパー: ヘッダー（navy 背景 + アイコン + タイトル）と本体領域を持つ
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

// Server Component: データ取得は getAllPosts() で行い、外部画像は一切使わない
export function Sidebar() {
  const recentPosts = getAllPosts().slice(0, 5)

  return (
    <div className="flex flex-col gap-6">
      {/* 1. 検索 — 静的 UI のみ（動作不要） */}
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

      {/* 2. 最新記事 — getAllPosts() から上位 5 件を表示 */}
      <SidebarSection icon={FileText} title="最新記事">
        <div className="flex flex-col">
          {recentPosts.map((post, index) => {
            const rank = index + 1
            return (
              <Link
                key={post.slug}
                href={`/blog/${post.slug}`}
                className={`group flex items-start gap-3 py-3 ${
                  index !== recentPosts.length - 1 ? 'border-b border-gray-100' : ''
                }`}
              >
                {/* ランクバッジ */}
                <div
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded text-[12px] font-bold text-white ${rankColor(rank)}`}
                >
                  {rank}
                </div>
                {/* タイトル */}
                <p className="flex-1 text-[13px] leading-snug text-gray-700 group-hover:text-[#1e3a5f]">
                  {post.title}
                </p>
              </Link>
            )
          })}
        </div>
      </SidebarSection>

      {/* 3. カテゴリ — 静的 4 カテゴリ */}
      <SidebarSection icon={FolderOpen} title="カテゴリ">
        <div className="flex flex-col">
          {categories.map((category, index) => (
            <Link
              key={category.name}
              href={category.href}
              className={`group flex items-center justify-between py-3 ${
                index !== categories.length - 1 ? 'border-b border-gray-100' : ''
              }`}
            >
              <span className="flex items-center gap-2">
                {/* カテゴリカラー丸 */}
                <span
                  className="h-3 w-3 rounded-full"
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

      {/* 4. ブログ管理者 — 外部画像なし、文字アバター */}
      <SidebarSection icon={User} title="ブログ管理者">
        <div className="flex flex-col items-center text-center">
          {/* 文字アバター: 外部画像不使用 */}
          <div className="mb-3 flex h-20 w-20 items-center justify-center rounded-full bg-[#1e3a5f]">
            <span className="text-3xl font-bold text-white">藍</span>
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
