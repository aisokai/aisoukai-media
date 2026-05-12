import type { Metadata } from 'next'
import { HeroSection } from '@/components/HeroSection'

export const metadata: Metadata = {
  title: '運営者情報',
  description: '三谷ファミリー歯科クリニックによる歯科情報メディアの運営方針と掲載内容の位置づけをご案内します。',
}

export default function AboutPage() {
  return (
    <>
      <HeroSection
        title="運営者情報"
        description="このサイトの運営方針と掲載内容の位置づけをお知らせします"
      />
      <div className="mx-auto max-w-[1100px] px-4 py-8">
        <div className="rounded-lg bg-white p-6 shadow-sm">
          <p className="text-[14px] leading-relaxed text-gray-700">
            ここでは、三谷ファミリー歯科クリニックの情報発信サイトとして、歯科医療に関する一般的な情報をわかりやすく届けることを目的としています。
          </p>
        </div>
      </div>
    </>
  )
}
