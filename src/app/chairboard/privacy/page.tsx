import type { Metadata } from 'next'
import { NOINDEX_METADATA } from '@/lib/seo'
import { HeroSection } from '@/components/HeroSection'

// iPadアプリ「チェアボード」のプライバシーポリシー（App Store 申請用の固定URL）。
// 記事ではない固定ページ。sitemap / 記事一覧には含めない。URL は変更しないこと。
export const metadata: Metadata = {
  title: 'チェアボード プライバシーポリシー',
  description: 'iPadアプリ「チェアボード」のプライバシーポリシーです。',
  ...NOINDEX_METADATA,
}

export default function ChairboardPrivacyPage() {
  return (
    <>
      <HeroSection title="チェアボード プライバシーポリシー" />
      <div className="mx-auto max-w-[1100px] px-4 py-8">
        <div className="space-y-6 rounded-lg bg-white p-6 text-[14px] leading-relaxed text-gray-700 shadow-sm">
          <p>最終更新日: 2026年10月9日</p>
          <p>
            「チェアボード」は、歯科医院の院内で、診療チェアの呼び出しの状況をスタッフのiPadで共有するためのアプリです。
          </p>

          <section className="space-y-2">
            <h2 className="text-[16px] font-bold text-[#1e3a5f]">扱う情報</h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>このアプリは、患者さんの情報（お名前、診療の内容など）を扱いません。</li>
              <li>
                このアプリが通信する相手は、医院の中に置いたサーバーだけです。開発者や第三者のサーバーへ、情報を送ることはありません。
              </li>
              <li>
                医院の中のサーバーには、次のものが保存されます。これらは、アプリの機能のためだけに使い、個人には結び付けません。
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  <li>端末の名前（管理者が付けた番号）</li>
                  <li>通知の宛先（Apple の通知の仕組みで使う識別子）</li>
                  <li>依頼・対応・完了の操作の記録（どの端末が、いつ行ったか）</li>
                </ul>
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-[16px] font-bold text-[#1e3a5f]">通知</h2>
            <p>
              通知を届けるために、医院の中のサーバーから Apple の通知の仕組み（Apple Push Notification service）へ、チェアの名前とステータス名（例: 「チェアー3：メンテチェック」）と、意味を持たない識別子を送ります。
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-[16px] font-bold text-[#1e3a5f]">カメラ</h2>
            <p>
              カメラは、端末の登録用のQRコードを読み取るときにだけ使います。画像は、保存も送信もしません。
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-[16px] font-bold text-[#1e3a5f]">広告・解析・追跡</h2>
            <p>広告の表示、利用状況の解析、追跡は行いません。</p>
          </section>

          <section className="space-y-2">
            <h2 className="text-[16px] font-bold text-[#1e3a5f]">お問い合わせ</h2>
            <p>
              三谷ファミリー歯科クリニック
              <br />
              連絡先:{' '}
              <a href="mailto:mfdc_office@aisokai.com" className="text-[#1e3a5f] underline">
                mfdc_office@aisokai.com
              </a>
            </p>
          </section>
        </div>
      </div>
    </>
  )
}
