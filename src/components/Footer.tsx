import Link from "next/link"

const footerLinks = {
  categories: [
    { name: "虫歯治療", href: "/category/cavity" },
    { name: "根管治療", href: "/category/root-canal" },
    { name: "歯周病治療", href: "/category/periodontal" },
    { name: "予防歯科", href: "/category/preventive" },
    { name: "小児歯科", href: "/category/pediatric" },
    { name: "矯正歯科", href: "/category/orthodontics" },
    { name: "親知らずの抜歯", href: "/category/wisdom-tooth" },
    { name: "インプラント治療", href: "/category/implant" },
    { name: "その他", href: "/category/other" },
  ],
  about: [
    { name: "運営者情報", href: "/about" },
    { name: "お問い合わせ", href: "/contact" },
    { name: "プライバシーポリシー", href: "/privacy" },
    { name: "サイトマップ", href: "/sitemap" },
  ],
}

export function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="bg-[#1e3a5f]">
      {/* Main footer */}
      <div className="mx-auto max-w-[1100px] px-4 py-12">
        <div className="grid gap-8 md:grid-cols-4">
          {/* Logo section */}
          <div className="md:col-span-2">
            <Link href="/" className="mb-4 inline-flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white">
                <span className="text-lg font-bold text-[#1e3a5f]">藍</span>
              </div>
              <span className="text-[16px] font-bold text-white">医療法人藍想会</span>
            </Link>
            <p className="mt-4 text-[13px] leading-relaxed text-white/70">
              三谷ファミリー歯科クリニックのブログサイトです。
              虫歯治療から矯正歯科、インプラント治療まで、専門家がわかりやすく解説します。
            </p>
          </div>

          {/* Categories */}
          <div>
            <h4 className="mb-4 text-[13px] font-bold text-white">カテゴリ</h4>
            <ul className="flex flex-col gap-2">
              {footerLinks.categories.map((link) => (
                <li key={link.name}>
                  <Link
                    href={link.href}
                    className="text-[13px] text-white/70 transition-colors hover:text-white"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* About */}
          <div>
            <h4 className="mb-4 text-[13px] font-bold text-white">サイト情報</h4>
            <ul className="flex flex-col gap-2">
              {footerLinks.about.map((link) => (
                <li key={link.name}>
                  <Link
                    href={link.href}
                    className="text-[13px] text-white/70 transition-colors hover:text-white"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Copyright */}
      <div className="border-t border-white/10">
        <div className="mx-auto max-w-[1100px] px-4 py-4">
          <p className="text-center text-[11px] text-white/50">
            Copyright &copy; {year} 医療法人藍想会 三谷ファミリー歯科クリニック All Rights Reserved.
          </p>
        </div>
      </div>
    </footer>
  )
}
