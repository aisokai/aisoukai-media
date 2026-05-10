import Link from 'next/link'
import { Clock } from 'lucide-react'
import type { PostMeta } from '@/lib/posts'

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

export function ArticleCard({ slug, title, description, category, date }: PostMeta) {
  const color = CATEGORY_COLORS[category] ?? '#6b7280'
  return (
    <Link
      href={`/blog/${slug}`}
      className="group flex flex-col overflow-hidden rounded-lg bg-white shadow-sm transition-all hover:shadow-md"
    >
      <div
        className="relative h-[120px]"
        style={{ background: `linear-gradient(135deg, ${color}dd, ${color}88)` }}
      >
        <span
          className="absolute left-0 top-0 px-3 py-1.5 text-[11px] font-bold text-white"
          style={{ backgroundColor: color }}
        >
          {category}
        </span>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="mb-2 line-clamp-2 text-[15px] font-bold leading-snug text-gray-800 group-hover:text-[#1e3a5f]">
          {title}
        </h3>
        <p className="mb-3 line-clamp-2 flex-1 text-[13px] leading-relaxed text-gray-500">
          {description}
        </p>
        <div className="flex items-center gap-1 text-[11px] text-gray-400">
          <Clock className="h-3 w-3" />
          {date}
        </div>
      </div>
    </Link>
  )
}
