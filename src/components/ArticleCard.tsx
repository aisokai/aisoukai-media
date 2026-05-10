import Link from 'next/link'
import Image from 'next/image'
import { Clock, Shield, Activity, Smile, Baby, Zap, Layers, Star, HelpCircle } from 'lucide-react'
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

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  "虫歯治療": Shield,
  "根管治療": Activity,
  "歯周病治療": Smile,
  "予防歯科": Star,
  "小児歯科": Baby,
  "親知らず": Zap,
  "親知らずの抜歯": Zap,
  "インプラント": Layers,
  "インプラント治療": Layers,
  "AI歯科": Star,
  "矯正歯科": Smile,
}

export function ArticleCard({ slug, title, excerpt, category, date, image, reviewed }: PostMeta) {
  const color = CATEGORY_COLORS[category] ?? '#6b7280'
  const Icon = CATEGORY_ICONS[category] ?? HelpCircle

  return (
    <Link
      href={`/blog/${slug}`}
      className="group flex flex-col overflow-hidden rounded-lg bg-white shadow-sm transition-all hover:shadow-md"
    >
      {/* 画像エリア: image prop があれば next/image、なければグラデーション+アイコン */}
      <div className="relative aspect-[16/9] overflow-hidden bg-gray-100">
        {image ? (
          <Image
            src={image}
            alt={title}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center"
            style={{ background: `linear-gradient(135deg, ${color}cc, ${color}66)` }}
          >
            <Icon className="h-12 w-12 text-white/60" />
          </div>
        )}
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
        {!reviewed && (
          <div className="mb-2">
            <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700">
              未レビュー
            </span>
          </div>
        )}
        <p className="mb-3 line-clamp-2 flex-1 text-[13px] leading-relaxed text-gray-500">
          {excerpt}
        </p>
        <div className="flex items-center gap-1 text-[11px] text-gray-400">
          <Clock className="h-3 w-3" />
          {date}
        </div>
      </div>
    </Link>
  )
}
