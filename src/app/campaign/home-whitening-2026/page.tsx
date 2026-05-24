import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, CheckCircle2, ClipboardList, ShieldCheck, Sparkles } from 'lucide-react'
import { buildCanonicalUrl, SITE_NAME } from '@/lib/seo'

const pagePath = '/campaign/home-whitening-2026'
const ctaHref = '/contact'

const comparisonRows = [
  { item: 'ホームホワイトニングジェル', normal: '4本', campaign: '6本' },
  { item: 'トレー', normal: '上下', campaign: '上下' },
  { item: 'ケース', normal: '別途220円', campaign: 'セット' },
  { item: '価格', normal: '33,000円（税込）', campaign: '28,000円（税込）' },
]

const recommendedItems = [
  '歯の黄ばみが気になる方',
  '自然な白さを目指したい方',
  'イベントや写真撮影前に歯を整えたい方',
  '自宅で無理なくホワイトニングを始めたい方',
  '歯科医院で相談しながら進めたい方',
]

const benefits = [
  'お口の状態を確認してから始められる',
  '専用トレーを作製できる',
  '使い方をスタッフが説明する',
  'しみる・不安なども相談できる',
  '市販品ではなく歯科医院管理のホワイトニングを受けられる',
]

const flowSteps = [
  'ご相談',
  'お口のチェック',
  'トレー作製',
  'ジェル・ケースのお渡し',
  'ご自宅で開始',
]

const cautionItems = [
  '効果には個人差があります。',
  'むし歯・歯周病がある場合は、先に治療が必要になることがあります。',
  '詰め物・被せ物は白くなりません。',
  '知覚過敏の症状が出る場合があります。',
  '掲載画像はイメージを含みます。実際のジェル・トレーとは異なる場合があります。',
]

export const metadata: Metadata = {
  title: '2026年 ホームホワイトニングキャンペーン',
  description:
    '自宅で少しずつ自然な白さを目指したい方向けの、2026年ホームホワイトニングキャンペーンのご案内です。価格・内容・注意事項をわかりやすくまとめています。',
  alternates: { canonical: buildCanonicalUrl(pagePath) },
  openGraph: {
    type: 'website',
    title: `2026年 ホームホワイトニングキャンペーン | ${SITE_NAME}`,
    description:
      '2026年6月1日（月）から9月30日（水）までのホームホワイトニングキャンペーン。内容・価格・注意事項をご確認いただけます。',
    url: buildCanonicalUrl(pagePath),
    siteName: SITE_NAME,
  },
  twitter: {
    card: 'summary',
    title: `2026年 ホームホワイトニングキャンペーン | ${SITE_NAME}`,
    description:
      'ご自宅で少しずつ進めるホームホワイトニングのキャンペーン内容を、スマホでも読みやすくご案内します。',
  },
}

function SectionHeading({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string
  title: string
  body?: string
}) {
  return (
    <div className="space-y-3">
      <p className="text-[12px] font-semibold uppercase tracking-[0.22em] text-[#b08d57]">{eyebrow}</p>
      <h2 className="text-[26px] font-bold leading-tight text-[#1f2937]">{title}</h2>
      {body ? <p className="max-w-[42rem] text-[15px] leading-7 text-gray-600">{body}</p> : null}
    </div>
  )
}

export default function HomeWhiteningCampaignPage() {
  return (
    <div className="bg-[#fbf8f1]">
      <section className="overflow-hidden border-b border-[#eadfca] bg-[linear-gradient(180deg,#fffdfa_0%,#f8f2e6_100%)]">
        <div className="mx-auto grid max-w-[1100px] gap-8 px-4 py-10 md:px-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:gap-12 lg:py-16">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#eadfca] bg-white/80 px-4 py-2 text-[12px] font-medium text-[#8b6b3f]">
              <Sparkles className="h-4 w-4" />
              2026年6月1日（月）〜2026年9月30日（水）
            </div>
            <div className="space-y-4">
              <p className="text-[15px] font-medium text-[#8b6b3f]">自宅で少しずつ、自然な白い歯へ。</p>
              <h1 className="text-[34px] font-bold leading-[1.2] text-[#1f2937]">
                2026年
                <br />
                ホームホワイトニングキャンペーン
              </h1>
              <p className="text-[15px] leading-7 text-gray-600">
                歯科医院でお口の状態を確認しながら、ご自宅で少しずつ進めていくホームホワイトニングです。
                キャンペーン期間中は、通常より始めやすい内容でご案内しています。
              </p>
            </div>
            <div className="rounded-[28px] border border-[#eadfca] bg-white p-5 shadow-[0_18px_40px_rgba(176,141,87,0.08)]">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-[13px] font-medium text-gray-500">キャンペーン価格</p>
                  <p className="mt-1 text-[34px] font-bold leading-none text-[#9a7440]">28,000円（税込）</p>
                </div>
                <p className="rounded-full bg-[#f8f2e6] px-3 py-1 text-[12px] font-semibold text-[#8b6b3f]">自由診療</p>
              </div>
              <div className="mt-4 grid gap-3 text-[14px] text-gray-600">
                <p>内容: ホームホワイトニングジェル6本 / トレー上下 / 通常ケース代220円もセット</p>
                <p>期間: 2026年6月1日（月）〜2026年9月30日（水）</p>
              </div>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href={ctaHref}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-[#1e3a5f] px-6 py-4 text-[15px] font-semibold text-white transition-transform hover:-translate-y-0.5"
              >
                予約・相談する
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="#campaign-details"
                className="inline-flex items-center justify-center rounded-full border border-[#d8c6a6] bg-white px-6 py-4 text-[15px] font-semibold text-[#8b6b3f] transition-colors hover:bg-[#fff8eb]"
              >
                キャンペーン内容を見る
              </a>
            </div>
            <p className="text-[12px] leading-6 text-gray-500">
              ※ 予約・相談ボタンは現在仮導線としてお問い合わせページへ遷移します。今後、LINE・電話・予約URLに差し替える可能性があります。
            </p>
          </div>

          <div className="relative">
            <div className="absolute inset-x-6 top-6 h-full rounded-[32px] bg-[#efe4cf]" />
            <div className="relative rounded-[32px] border border-[#eadfca] bg-white p-6 shadow-[0_20px_50px_rgba(30,58,95,0.08)]">
              <div className="space-y-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f8f2e6] text-[#9a7440]">
                    <ShieldCheck className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-[14px] font-semibold text-[#1f2937]">院内で確認してからスタート</p>
                    <p className="text-[13px] text-gray-500">はじめての方でも相談しながら進められます。</p>
                  </div>
                </div>
                <div className="rounded-3xl bg-[#fcfaf5] p-5">
                  <p className="text-[13px] font-semibold text-[#8b6b3f]">キャンペーンのポイント</p>
                  <ul className="mt-4 space-y-3 text-[14px] leading-6 text-gray-600">
                    <li className="flex gap-3">
                      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#b08d57]" />
                      ジェルが通常 4本から 6本に増え、継続しやすい内容です。
                    </li>
                    <li className="flex gap-3">
                      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#b08d57]" />
                      専用トレーは上下分を作製し、ご自宅で使用します。
                    </li>
                    <li className="flex gap-3">
                      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#b08d57]" />
                      通常ケース代220円もセットに含まれます。
                    </li>
                  </ul>
                </div>
                <div className="rounded-3xl border border-dashed border-[#d8c6a6] bg-[linear-gradient(180deg,#fffefb_0%,#f8f2e6_100%)] p-5">
                  <p className="text-[13px] font-semibold text-[#1f2937]">補助ビジュアル枠</p>
                  <p className="mt-2 text-[13px] leading-6 text-gray-500">
                    チラシ画像や院内案内画像は、後からこの周辺へ追加しやすい構成にしています。現時点では文字情報だけで内容が伝わるように整えています。
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="campaign-details" className="mx-auto max-w-[1100px] space-y-16 px-4 py-12 md:px-6 md:py-16">
        <div className="rounded-[32px] border border-[#eadfca] bg-white p-6 shadow-sm md:p-8">
          <SectionHeading
            eyebrow="Campaign"
            title="キャンペーン内容"
            body="通常プランとキャンペーン内容を比較しやすい形でまとめています。価格・本数・付属内容をご確認ください。"
          />
          <div className="mt-6 overflow-hidden rounded-3xl border border-[#efe4cf]">
            <div className="grid grid-cols-[1.1fr_0.95fr_0.95fr] bg-[#f8f2e6] text-[13px] font-semibold text-[#6b5a3e]">
              <div className="px-4 py-4">項目</div>
              <div className="px-4 py-4">通常</div>
              <div className="px-4 py-4">キャンペーン</div>
            </div>
            {comparisonRows.map((row, index) => (
              <div
                key={row.item}
                className={`grid grid-cols-[1.1fr_0.95fr_0.95fr] text-[14px] ${
                  index % 2 === 0 ? 'bg-white' : 'bg-[#fffdfa]'
                }`}
              >
                <div className="border-t border-[#f3ead9] px-4 py-4 font-semibold text-[#1f2937]">{row.item}</div>
                <div className="border-t border-[#f3ead9] px-4 py-4 text-gray-600">{row.normal}</div>
                <div className="border-t border-[#f3ead9] px-4 py-4 font-semibold text-[#9a7440]">{row.campaign}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-[32px] border border-[#eadfca] bg-white p-6 shadow-sm md:p-8">
            <SectionHeading eyebrow="Recommended" title="こんな方におすすめです" />
            <ul className="mt-6 space-y-4">
              {recommendedItems.map((item) => (
                <li key={item} className="flex gap-3 text-[15px] leading-7 text-gray-600">
                  <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-[#b08d57]" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-[32px] border border-[#eadfca] bg-[linear-gradient(180deg,#fffefb_0%,#f7efe0_100%)] p-6 shadow-sm md:p-8">
            <SectionHeading
              eyebrow="About"
              title="ホームホワイトニングとは"
              body="歯科医院で専用トレーを作製し、ご自宅でジェルを使って少しずつ歯を白くしていくホワイトニング方法です。"
            />
            <div className="mt-6 rounded-3xl bg-white/80 p-5">
              <p className="text-[14px] leading-7 text-gray-600">
                ご自身のペースで進めやすく、歯科医院で使い方を確認してから始められるのが特徴です。はじめる前にお口の状態を確認するため、
                不安がある方も相談しながら進められます。
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-[32px] border border-[#eadfca] bg-white p-6 shadow-sm md:p-8">
          <SectionHeading eyebrow="Benefits" title="当院で行うメリット" />
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {benefits.map((item) => (
              <div key={item} className="rounded-3xl bg-[#fcfaf5] p-5">
                <div className="flex gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-[#b08d57]">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <p className="text-[14px] leading-7 text-gray-600">{item}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-[32px] border border-[#eadfca] bg-white p-6 shadow-sm md:p-8">
            <SectionHeading eyebrow="Flow" title="ご利用の流れ" />
            <ol className="mt-6 space-y-4">
              {flowSteps.map((step, index) => (
                <li key={step} className="flex items-start gap-4 rounded-3xl bg-[#fcfaf5] p-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#1e3a5f] text-[14px] font-bold text-white">
                    {index + 1}
                  </span>
                  <div>
                    <p className="text-[15px] font-semibold text-[#1f2937]">{step}</p>
                    <p className="mt-1 text-[13px] leading-6 text-gray-500">
                      {index === 0 && 'ご希望や気になることをお伺いします。'}
                      {index === 1 && 'むし歯や歯ぐきの状態などを確認します。'}
                      {index === 2 && 'ご自宅で使う専用トレーを作製します。'}
                      {index === 3 && 'ジェルとケースをお渡しし、使い方をご説明します。'}
                      {index === 4 && 'ご自宅で無理のないペースで開始します。'}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div className="rounded-[32px] border border-[#eadfca] bg-white p-6 shadow-sm md:p-8">
            <SectionHeading eyebrow="Caution" title="ご注意事項" />
            <ul className="mt-6 space-y-4">
              {cautionItems.map((item) => (
                <li key={item} className="flex gap-3 text-[14px] leading-7 text-gray-600">
                  <ClipboardList className="mt-1 h-5 w-5 shrink-0 text-[#b08d57]" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="rounded-[36px] border border-[#e1d0b0] bg-[#1e3a5f] px-6 py-8 text-white shadow-[0_22px_60px_rgba(30,58,95,0.18)] md:px-10 md:py-10">
          <p className="text-[12px] font-semibold uppercase tracking-[0.22em] text-[#f0d6a2]">Final CTA</p>
          <h2 className="mt-3 text-[28px] font-bold leading-tight">この機会に、憧れの白い歯へ。</h2>
          <p className="mt-4 max-w-[38rem] text-[15px] leading-7 text-white/80">
            ホームホワイトニングに興味がある方は、スタッフまでお気軽にご相談ください。内容の確認だけでも問題ありません。
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href={ctaHref}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-4 text-[15px] font-semibold text-[#1e3a5f] transition-transform hover:-translate-y-0.5"
            >
              予約・相談する
              <ArrowRight className="h-4 w-4" />
            </Link>
            <p className="text-[12px] leading-6 text-white/70">
              現在は仮導線としてお問い合わせページへご案内しています。
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
