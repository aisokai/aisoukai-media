import { HeroSection } from '@/components/HeroSection'

export default function ContactPage() {
  return (
    <>
      <HeroSection
        title="お問い合わせ"
        description="サイト内容に関するご連絡先の案内ページです"
      />
      <div className="mx-auto max-w-[1100px] px-4 py-8">
        <div className="rounded-lg bg-white p-6 shadow-sm">
          <p className="text-[14px] leading-relaxed text-gray-700">
            このページは公開導線の整備用です。お問い合わせ方法は、クリニックの公式案内をご確認ください。
          </p>
        </div>
      </div>
    </>
  )
}
