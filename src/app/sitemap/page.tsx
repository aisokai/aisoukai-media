import Link from 'next/link'
import { HeroSection } from '@/components/HeroSection'

const links = [
  { href: '/', label: 'ホーム' },
  { href: '/blog', label: '記事一覧' },
  { href: '/category/cavity', label: '虫歯治療' },
  { href: '/category/root-canal', label: '根管治療' },
  { href: '/category/periodontal', label: '歯周病治療' },
  { href: '/category/preventive', label: '予防歯科' },
  { href: '/category/pediatric', label: '小児歯科' },
  { href: '/category/orthodontics', label: '矯正歯科' },
  { href: '/category/wisdom-tooth', label: '親知らず' },
  { href: '/category/implant', label: 'インプラント' },
  { href: '/category/other', label: 'その他' },
  { href: '/category/news', label: 'お知らせ' },
]

export default function SitemapPage() {
  return (
    <>
      <HeroSection
        title="サイトマップ"
        description="主要ページへの導線をまとめています"
      />
      <div className="mx-auto max-w-[1100px] px-4 py-8">
        <div className="rounded-lg bg-white p-6 shadow-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-md border border-gray-200 px-4 py-3 text-[14px] text-gray-700 hover:border-[#1e3a5f] hover:text-[#1e3a5f]"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
