import type { Metadata } from 'next'
import { NOINDEX_METADATA } from '@/lib/seo'
import { HeroSection } from '@/components/HeroSection'

export const metadata: Metadata = {
  title: 'プライバシーポリシー',
  description: 'プライバシーポリシーのご案内です。',
  ...NOINDEX_METADATA,
}

export default function PrivacyPage() {
  return (
    <>
      <HeroSection
        title="プライバシーポリシー"
        description="サイト閲覧時の情報の扱いについての案内です"
      />
      <div className="mx-auto max-w-[1100px] px-4 py-8">
        <div className="rounded-lg bg-white p-6 shadow-sm">
          <p className="text-[14px] leading-relaxed text-gray-700">
            本サイトは一般公開情報の提供を目的としています。個人情報の取り扱いが必要な場合は、公式の窓口でご確認ください。
          </p>
        </div>
      </div>
    </>
  )
}
