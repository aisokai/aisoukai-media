import type { Metadata } from 'next'
import { Noto_Sans_JP } from 'next/font/google'
import './globals.css'
import { Header } from '@/components/Header'
import { Footer } from '@/components/Footer'

const notoSansJP = Noto_Sans_JP({
  subsets: ['latin'],
  weight: ['300', '400', '500', '700'],
  variable: '--font-noto-sans-jp',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: '医療法人藍想会 | 三谷ファミリー歯科クリニック',
    template: '%s | 三谷ファミリー歯科クリニック',
  },
  description: '徳島県の三谷ファミリー歯科クリニックによる歯科情報メディア。虫歯・歯周病・予防歯科・訪問歯科など専門的な情報をわかりやすく解説します。',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ja" className={notoSansJP.variable}>
      <body className="min-h-screen flex flex-col font-sans bg-[#f7f7f7] text-gray-800">
        <Header />
        <main className="flex-1">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  )
}
