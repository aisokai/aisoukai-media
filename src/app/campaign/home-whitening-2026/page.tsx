import type { Metadata } from 'next'
import Link from 'next/link'
import {
  ArrowRight,
  Check,
  CircleHelp,
  Clock3,
  Gem,
  ShieldCheck,
  Smile,
  Sparkles,
  Stethoscope,
} from 'lucide-react'
import { buildCanonicalUrl, SITE_NAME } from '@/lib/seo'

const pagePath = '/campaign/home-whitening-2026'
const ctaHref = '/contact'

const recommendedItems = [
  '歯の黄ばみが気になる方',
  '自然な白さを目指したい方',
  'イベントや写真撮影前に歯を整えたい方',
  '自宅で無理なくホワイトニングを始めたい方',
  '歯科医院で相談しながら進めたい方',
]

const concernItems = [
  '何を選べばよいか分からず、自己判断で始めるのが不安',
  '市販品や自己流では、自分に合っているか判断しにくい',
  'しみることや、お口の状態に問題がないか気になる',
]

const featureCards = [
  {
    title: '自宅で進めやすい',
    body: '専用トレーとジェルを使って、ご自宅で少しずつ進めるホワイトニングです。',
    icon: Clock3,
  },
  {
    title: '院内で確認してから開始',
    body: 'むし歯や歯ぐきの状態などを確認したうえで始めるため、相談しながら進められます。',
    icon: Stethoscope,
  },
  {
    title: '自然な白さを目指す',
    body: '急いで強く白くするのではなく、日常になじみやすい白さを目指したい方に向いています。',
    icon: Sparkles,
  },
]

const comparisonRows = [
  { item: '施術場所', home: 'ご自宅', office: '歯科医院' },
  { item: '進め方', home: '少しずつ継続', office: '来院時に処置' },
  { item: '向いている方', home: '自分のペースで始めたい方', office: '短時間で院内施術を受けたい方' },
  { item: '今回の対象', home: 'キャンペーン対象', office: '対象外' },
]

const clinicReasons = [
  {
    title: '専用トレーを作製できる',
    body: '歯科医院で専用トレーを作るため、ご自宅での使用方法を合わせて案内しやすくなります。',
  },
  {
    title: 'お口の状態を確認して案内',
    body: 'むし歯・歯周病などの状態確認を行い、始められるかどうかを見たうえでご案内します。',
  },
  {
    title: '気になる症状も相談しやすい',
    body: 'しみる感じや使い方の不安があったときも、相談しながら進められます。',
  },
]

const flowSteps = [
  {
    title: 'ご相談・ご予約',
    body: '気になることやご希望をお伺いします。まずは相談だけでも問題ありません。',
  },
  {
    title: 'お口のチェック',
    body: 'むし歯・歯周病の有無や、お口の状態を確認します。',
  },
  {
    title: '専用トレー作製',
    body: '上下のトレーを作製し、ご自宅で使えるよう準備します。',
  },
  {
    title: 'ジェル・ケースのお渡し',
    body: '使い方の説明とあわせて、ジェル6本とケースをお渡しします。',
  },
  {
    title: 'ご自宅で開始',
    body: '無理のないペースでホームホワイトニングを始めます。',
  },
]

const cautions = [
  '効果には個人差があります。',
  'むし歯・歯周病がある場合は、先に治療が必要になることがあります。',
  '詰め物・被せ物は白くなりません。',
  '知覚過敏の症状が出る場合があります。',
  '掲載画像はイメージを含みます。実際のジェル・トレーとは異なる場合があります。',
]

const faqs = [
  {
    question: 'はじめてでも相談できますか？',
    answer: 'はい。まずはお口の状態を確認したうえで、ホームホワイトニングが始められるかをご案内します。',
  },
  {
    question: 'すぐに真っ白になりますか？',
    answer: '急激な変化を保証するものではありません。少しずつ白さを目指す方法で、効果には個人差があります。',
  },
  {
    question: 'しみることはありますか？',
    answer: '知覚過敏の症状が出る場合があります。気になる症状がある場合は、使用方法を含めてご相談ください。',
  },
  {
    question: '被せ物や詰め物も白くなりますか？',
    answer: '詰め物・被せ物は白くなりません。天然歯の色味が対象です。',
  },
]

const campaignSummary = [
  { label: '価格', value: '28,000円（税込）', tone: 'bg-white text-[#143a62]' },
  {
    label: '期間',
    value: '2026年6月1日（月）〜2026年9月30日（水）',
    tone: 'bg-[#fbf7ef] text-slate-700',
  },
  {
    label: '内容',
    value: 'ジェル6本 / トレー上下 / ケースセット',
    tone: 'bg-[#f6fbfb] text-slate-700',
  },
]

export const metadata: Metadata = {
  title: '2026年 ホームホワイトニングキャンペーン',
  description:
    '2026年ホームホワイトニングキャンペーンのご案内です。価格・期間・対象・流れ・注意事項を、スマホでも見やすいLP形式でまとめています。',
  alternates: { canonical: buildCanonicalUrl(pagePath) },
  openGraph: {
    type: 'website',
    title: `2026年 ホームホワイトニングキャンペーン | ${SITE_NAME}`,
    description:
      'ホームホワイトニングジェル6本、トレー上下、通常ケース代220円セットのキャンペーン内容を掲載しています。',
    url: buildCanonicalUrl(pagePath),
    siteName: SITE_NAME,
  },
  twitter: {
    card: 'summary',
    title: `2026年 ホームホワイトニングキャンペーン | ${SITE_NAME}`,
    description:
      '価格・期間・対象・注意事項を上部に整理した、患者さん向けキャンペーンLPです。',
  },
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#9b7a34]">
      {children}
    </p>
  )
}

function SectionTitle({
  label,
  title,
  body,
}: {
  label: string
  title: string
  body?: string
}) {
  return (
    <div className="max-w-[42rem]">
      <SectionLabel>{label}</SectionLabel>
      <h2 className="mt-3 text-[28px] font-black leading-[1.2] tracking-[-0.02em] text-[#16324f] md:text-[34px]">
        {title}
      </h2>
      {body ? <p className="mt-4 text-[15px] leading-8 text-slate-600">{body}</p> : null}
    </div>
  )
}

export default function HomeWhiteningCampaignPage() {
  return (
    <div className="bg-[#fcfaf5] text-slate-800">
      <section className="relative overflow-hidden bg-[linear-gradient(180deg,#fffdf8_0%,#f7f3e9_36%,#f8fbfb_100%)]">
        <div className="absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_top,rgba(229,208,159,0.30),transparent_58%)]" />
        <div className="absolute left-1/2 top-24 h-72 w-72 -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.82)_0%,rgba(255,255,255,0)_68%)] blur-3xl" />
        <div className="mx-auto max-w-[1120px] px-4 pb-14 pt-8 md:px-6 md:pb-20 md:pt-12">
          <div className="relative overflow-hidden rounded-[36px] border border-[#e6ddcc] bg-white/92 shadow-[0_30px_90px_rgba(68,73,55,0.10)] backdrop-blur">
            <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#d3bc81_0%,#efe4c7_50%,#d3bc81_100%)]" />
            <div className="grid gap-8 px-5 py-6 sm:px-7 sm:py-8 lg:grid-cols-[1.02fr_0.98fr] lg:px-10 lg:py-10">
              <div className="space-y-6 lg:space-y-7">
                <div className="flex flex-wrap gap-2 text-[12px] font-semibold">
                  <span className="rounded-full bg-[#16324f] px-4 py-2 text-white">
                    2026年 ホームホワイトニングキャンペーン
                  </span>
                  <span className="rounded-full border border-[#eadfca] bg-[#fbf7ef] px-4 py-2 text-[#7c6330]">
                    期間: 2026年6月1日（月）〜2026年9月30日（水）
                  </span>
                </div>

                <div className="space-y-4">
                  <p className="text-[12px] font-bold uppercase tracking-[0.28em] text-[#9b7a34]">
                    Clean. Calm. Professional.
                  </p>
                  <h1 className="max-w-[11em] text-[34px] font-black leading-[1.1] tracking-[-0.035em] text-[#16324f] sm:text-[44px] md:text-[52px]">
                    自宅で続けやすい
                    <br />
                    上品な白さを、
                    <br />
                    まずは相談から
                  </h1>
                  <p className="max-w-[37rem] text-[15px] leading-8 text-slate-600 md:text-[16px]">
                    歯科医院で専用トレーを作製し、ご自宅で少しずつ進めるホームホワイトニングです。
                    キャンペーン価格と内容を分かりやすく整理し、はじめての方でも相談しやすい導線でご案内しています。
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  {campaignSummary.map((item) => (
                    <div
                      key={item.label}
                      className={`rounded-[24px] border border-[#efe6d6] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] ${item.tone}`}
                    >
                      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#8a7444]">
                        {item.label}
                      </p>
                      <p className="mt-2 text-[14px] font-bold leading-6 sm:text-[15px]">{item.value}</p>
                    </div>
                  ))}
                </div>

                <div className="grid gap-3 rounded-[28px] border border-[#efe6d6] bg-[#fbf8f1] p-4 sm:grid-cols-2">
                  <div>
                    <div className="flex items-center gap-2 text-[#16324f]">
                      <Smile className="h-5 w-5" />
                      <p className="text-[13px] font-bold">こんな方におすすめ</p>
                    </div>
                    <ul className="mt-3 space-y-2 text-[14px] leading-6 text-slate-600">
                      <li>歯の黄ばみが気になる方</li>
                      <li>自然な白さを目指したい方</li>
                      <li>自宅で無理なく始めたい方</li>
                    </ul>
                  </div>
                  <div className="rounded-[22px] border border-[#eadfca] bg-white px-4 py-4">
                    <div className="flex items-center gap-2 text-[#7c6330]">
                      <Gem className="h-5 w-5" />
                      <p className="text-[13px] font-bold">キャンペーン内容</p>
                    </div>
                    <ul className="mt-3 space-y-2 text-[14px] leading-6 text-slate-600">
                      <li>ホームホワイトニングジェル6本</li>
                      <li>トレー上下</li>
                      <li>通常ケース代220円もセット</li>
                    </ul>
                  </div>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <Link
                    href={ctaHref}
                    className="inline-flex min-h-14 items-center justify-center gap-2 rounded-full bg-[#16324f] px-6 py-4 text-[15px] font-bold text-white shadow-[0_16px_34px_rgba(22,50,79,0.22)] transition-transform hover:-translate-y-0.5"
                  >
                    予約・相談する
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <a
                    href="#faq"
                    className="inline-flex min-h-14 items-center justify-center rounded-full border border-[#d9ccb3] bg-white px-6 py-4 text-[15px] font-bold text-[#7c6330] transition-colors hover:bg-[#fbf8f1]"
                  >
                    よくある質問を見る
                  </a>
                </div>

                <p className="text-[12px] leading-6 text-slate-500">
                  ※ 予約・相談ボタンは現在仮導線としてお問い合わせページへ遷移します。後日、予約URL等へ差し替える可能性があります。
                </p>
              </div>

              <div className="relative">
                <div className="absolute inset-x-8 top-5 h-32 rounded-full bg-[radial-gradient(circle,rgba(229,208,159,0.42)_0%,rgba(229,208,159,0)_72%)] blur-2xl" />
                <div className="relative rounded-[32px] border border-[#e8deca] bg-[linear-gradient(180deg,#fffefb_0%,#f8f4ea_100%)] p-4 shadow-[0_22px_54px_rgba(99,82,38,0.10)] sm:p-5">
                  <div className="rounded-[28px] bg-[#16324f] px-5 py-5 text-white">
                    <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#e8d9b0]">
                      Campaign Price
                    </p>
                    <p className="mt-3 text-[18px] font-bold leading-7">
                      ホームホワイトニングジェル6本
                      <br />
                      トレー上下 + ケースセット
                    </p>
                    <div className="mt-5 flex items-end gap-2">
                      <p className="text-[38px] font-black leading-none tracking-[-0.04em]">28,000円</p>
                      <p className="pb-1 text-[15px] font-semibold">（税込）</p>
                    </div>
                    <p className="mt-4 inline-flex rounded-full bg-white/12 px-3 py-2 text-[12px] font-bold text-[#f7ecd0]">
                      通常ケース代220円もセット
                    </p>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-[24px] border border-[#ece4d4] bg-white p-4">
                      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">通常</p>
                      <p className="mt-3 text-[15px] font-bold leading-7 text-[#16324f]">
                        ホームホワイトニング
                        <br />
                        ジェル4本 + トレー上下
                      </p>
                      <p className="mt-4 text-[23px] font-black text-slate-900">
                        33,000円
                        <span className="text-[14px] font-bold text-slate-500">（税込）</span>
                      </p>
                    </div>
                    <div className="rounded-[24px] border border-[#e7d7b5] bg-[#fbf7ef] p-4">
                      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#9b7a34]">今回の内容</p>
                      <ul className="mt-3 space-y-2 text-[14px] leading-6 text-slate-700">
                        <li className="flex gap-2">
                          <Check className="mt-1 h-4 w-4 shrink-0 text-[#9b7a34]" />
                          <span>ジェルが4本から6本へ増量</span>
                        </li>
                        <li className="flex gap-2">
                          <Check className="mt-1 h-4 w-4 shrink-0 text-[#9b7a34]" />
                          <span>トレー上下を含む基本セット</span>
                        </li>
                        <li className="flex gap-2">
                          <Check className="mt-1 h-4 w-4 shrink-0 text-[#9b7a34]" />
                          <span>通常ケース代220円もセット</span>
                        </li>
                      </ul>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-[22px] border border-[#ece4d4] bg-white px-4 py-4">
                      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#8a7444]">対象</p>
                      <p className="mt-2 text-[14px] font-semibold leading-6 text-slate-700">
                        自宅で無理なく
                        <br />
                        始めたい方
                      </p>
                    </div>
                    <div className="rounded-[22px] border border-[#ece4d4] bg-white px-4 py-4">
                      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#8a7444]">方式</p>
                      <p className="mt-2 text-[14px] font-semibold leading-6 text-slate-700">
                        専用トレーを
                        <br />
                        ご自宅で使用
                      </p>
                    </div>
                    <div className="rounded-[22px] border border-[#ece4d4] bg-white px-4 py-4">
                      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#8a7444]">相談</p>
                      <p className="mt-2 text-[14px] font-semibold leading-6 text-slate-700">
                        お口の状態を
                        <br />
                        確認して案内
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white">
        <div className="mx-auto max-w-[1120px] px-4 py-14 md:px-6 md:py-18">
          <SectionTitle
            label="Offer"
            title="通常内容との違いを、ひと目で確認できます"
            body="28,000円（税込）を中心に、通常内容との違いと今回のキャンペーン対象範囲を整理しています。スマホでも読みやすいよう、比較はカードと行リストの両方で確認しやすくしています。"
          />

          <div className="mt-8 grid gap-6 lg:grid-cols-[1.02fr_0.98fr]">
            <div className="rounded-[32px] border border-[#eadfca] bg-[#fbf8f1] p-5 sm:p-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-[24px] border border-[#ebe2d4] bg-white p-5">
                  <p className="text-[12px] font-bold text-slate-400">通常</p>
                  <p className="mt-3 text-[16px] font-bold leading-7 text-[#16324f]">
                    ホームホワイトニングジェル4本
                    <br />
                    + トレー上下
                  </p>
                  <p className="mt-4 text-[24px] font-black text-slate-900">
                    33,000円
                    <span className="ml-1 text-[14px] font-bold text-slate-500">（税込）</span>
                  </p>
                </div>

                <div className="rounded-[24px] border border-[#d8c490] bg-[linear-gradient(180deg,#fffaf0_0%,#f5ead0_100%)] p-5">
                  <p className="text-[12px] font-bold text-[#9b7a34]">キャンペーン</p>
                  <p className="mt-3 text-[16px] font-bold leading-7 text-[#16324f]">
                    ホームホワイトニングジェル6本
                    <br />
                    + トレー上下 + ケースセット
                  </p>
                  <p className="mt-4 text-[30px] font-black tracking-[-0.03em] text-[#16324f]">
                    28,000円
                    <span className="ml-1 text-[15px] font-bold text-[#7c6330]">（税込）</span>
                  </p>
                </div>
              </div>

              <div className="mt-5 rounded-[24px] border border-[#ebe2d4] bg-white p-4">
                <p className="text-[13px] font-bold text-[#16324f]">今回のポイント</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-[18px] bg-[#fbf8f1] px-4 py-3 text-[13px] font-semibold text-slate-700">
                    ジェル6本
                  </div>
                  <div className="rounded-[18px] bg-[#fbf8f1] px-4 py-3 text-[13px] font-semibold text-slate-700">
                    トレー上下
                  </div>
                  <div className="rounded-[18px] bg-[#fbf8f1] px-4 py-3 text-[13px] font-semibold text-slate-700">
                    ケース代220円もセット
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[32px] border border-[#e6ebec] bg-[#f7fbfb] p-5 sm:p-6">
              <p className="text-[13px] font-bold text-[#16324f]">ホームホワイトニングと院内ホワイトニングの違い</p>
              <div className="mt-4 space-y-3">
                {comparisonRows.map((row) => (
                  <div
                    key={row.item}
                    className="rounded-[22px] border border-white bg-white/90 px-4 py-4 shadow-[0_8px_20px_rgba(43,68,78,0.05)]"
                  >
                    <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-[#7a8c95]">
                      {row.item}
                    </p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-[16px] bg-[#f5f9fa] px-3 py-3">
                        <p className="text-[12px] font-bold text-[#16324f]">ホームホワイトニング</p>
                        <p className="mt-1 text-[14px] leading-6 text-slate-600">{row.home}</p>
                      </div>
                      <div className="rounded-[16px] bg-[#fbf7ef] px-3 py-3">
                        <p className="text-[12px] font-bold text-[#7c6330]">院内ホワイトニング</p>
                        <p className="mt-1 text-[14px] leading-6 text-slate-600">{row.office}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[linear-gradient(180deg,#f8fbfb_0%,#fcfaf5_100%)]">
        <div className="mx-auto max-w-[1120px] px-4 py-14 md:px-6 md:py-18">
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-[32px] border border-[#e5ecec] bg-white p-6 shadow-[0_14px_40px_rgba(48,70,78,0.06)]">
              <SectionTitle
                label="Concern"
                title="こんなお悩みはありませんか"
                body="自己流で始める前に、まずはお口の状態や進め方を確認したいという声に合わせた内容です。"
              />
              <ul className="mt-6 space-y-4">
                {concernItems.map((item) => (
                  <li key={item} className="flex gap-3 rounded-[24px] bg-[#f7fbfb] p-4 text-[15px] leading-7 text-slate-700">
                    <Sparkles className="mt-1 h-5 w-5 shrink-0 text-[#9b7a34]" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-[32px] border border-[#eadfca] bg-[linear-gradient(180deg,#fffefb_0%,#fbf6eb_100%)] p-6 shadow-[0_14px_40px_rgba(99,82,38,0.06)]">
              <SectionTitle
                label="Recommended"
                title="こうした方に向いています"
                body="急いで強い変化を求めるよりも、ご自宅で無理なく進めたい方に合いやすい方法です。"
              />
              <ul className="mt-6 space-y-4">
                {recommendedItems.map((item) => (
                  <li key={item} className="flex gap-3 rounded-[24px] bg-white p-4 text-[15px] leading-7 text-slate-700">
                    <Check className="mt-1 h-5 w-5 shrink-0 text-[#9b7a34]" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white">
        <div className="mx-auto max-w-[1120px] px-4 py-14 md:px-6 md:py-18">
          <SectionTitle
            label="Why Consult First"
            title="自己流で選ぶ前に、まず相談したい理由"
            body="ホームホワイトニングはご自宅で進めやすい一方で、お口の状態や使い方によって始め方の判断が変わることがあります。歯科医院で確認してから始めることで、無理のない進め方を選びやすくなります。"
          />

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {clinicReasons.map((reason) => (
              <div
                key={reason.title}
                className="rounded-[28px] border border-[#ebe3d6] bg-[#fffefb] p-5 shadow-[0_12px_28px_rgba(78,67,40,0.05)]"
              >
                <h3 className="text-[18px] font-bold text-[#16324f]">{reason.title}</h3>
                <p className="mt-3 text-[14px] leading-7 text-slate-600">{reason.body}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 rounded-[34px] border border-[#e5ecec] bg-[linear-gradient(135deg,#f7fbfb_0%,#f2f7f7_100%)] p-6 sm:p-7">
            <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
              <div className="max-w-[36rem]">
                <SectionLabel>Consultation CTA</SectionLabel>
                <h3 className="mt-3 text-[24px] font-black leading-[1.25] tracking-[-0.02em] text-[#16324f] sm:text-[28px]">
                  ホームホワイトニングを始める前に、まずは内容確認から
                </h3>
                <p className="mt-3 text-[14px] leading-7 text-slate-600">
                  相談だけでも問題ありません。キャンペーン内容と進め方をご確認いただけます。
                </p>
              </div>
              <Link
                href={ctaHref}
                className="inline-flex min-h-14 items-center justify-center gap-2 rounded-full bg-[#16324f] px-6 py-4 text-[15px] font-bold text-white shadow-[0_16px_30px_rgba(22,50,79,0.18)] transition-transform hover:-translate-y-0.5"
              >
                予約・相談する
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {featureCards.map(({ title, body, icon: Icon }) => (
              <div key={title} className="rounded-[28px] border border-[#e5ecec] bg-[#f8fbfb] p-5">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-[#16324f] shadow-sm">
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="mt-4 text-[18px] font-bold text-[#16324f]">{title}</h3>
                <p className="mt-3 text-[14px] leading-7 text-slate-600">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[linear-gradient(180deg,#fcfaf5_0%,#f8fbfb_100%)]">
        <div className="mx-auto max-w-[1120px] px-4 py-14 md:px-6 md:py-18">
          <div className="grid gap-6 lg:grid-cols-[1.02fr_0.98fr]">
            <div className="rounded-[34px] border border-[#e5ecec] bg-white p-6 shadow-[0_14px_40px_rgba(48,70,78,0.06)] md:p-8">
              <SectionTitle
                label="Flow"
                title="治療の流れ"
                body="相談からご自宅での開始まで、進め方を段階ごとに確認できます。"
              />
              <div className="mt-6 space-y-4">
                {flowSteps.map((step, index) => (
                  <div key={step.title} className="flex gap-4 rounded-[24px] bg-[#f7fbfb] p-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#16324f] text-[15px] font-black text-white">
                      {index + 1}
                    </div>
                    <div>
                      <h3 className="text-[17px] font-bold text-[#16324f]">{step.title}</h3>
                      <p className="mt-2 text-[14px] leading-7 text-slate-600">{step.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[34px] border border-[#eadfca] bg-[linear-gradient(180deg,#fffefb_0%,#fbf6eb_100%)] p-6 shadow-[0_14px_40px_rgba(99,82,38,0.06)] md:p-8">
              <SectionTitle
                label="Caution"
                title="注意事項"
                body="安心してご相談いただくため、事前に知っておきたい点をまとめています。"
              />
              <ul className="mt-6 space-y-4">
                {cautions.map((item) => (
                  <li key={item} className="flex gap-3 rounded-[24px] bg-white p-4 text-[14px] leading-7 text-slate-600">
                    <ShieldCheck className="mt-1 h-5 w-5 shrink-0 text-[#9b7a34]" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section id="faq" className="bg-white">
        <div className="mx-auto max-w-[1120px] px-4 py-14 md:px-6 md:py-18">
          <SectionTitle
            label="FAQ"
            title="よくある質問"
            body="はじめて相談される方が気になりやすい点を、先に確認できるようにしています。"
          />
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {faqs.map((faq) => (
              <div
                key={faq.question}
                className="rounded-[28px] border border-[#e5ecec] bg-[#f8fbfb] p-5 shadow-[0_12px_28px_rgba(48,70,78,0.04)]"
              >
                <div className="flex gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-[#16324f]">
                    <CircleHelp className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-[16px] font-bold leading-7 text-[#16324f]">{faq.question}</h3>
                    <p className="mt-2 text-[14px] leading-7 text-slate-600">{faq.answer}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[linear-gradient(180deg,#fffdf9_0%,#f4efe2_100%)]">
        <div className="mx-auto max-w-[1120px] px-4 pb-16 pt-6 md:px-6 md:pb-24">
          <div className="overflow-hidden rounded-[38px] border border-[#e6d6b8] bg-[linear-gradient(135deg,#16324f_0%,#21486f_58%,#8d7340_160%)] px-6 py-8 text-white shadow-[0_28px_80px_rgba(22,50,79,0.22)] md:px-10 md:py-10">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-[38rem]">
                <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#e8d9b0]">Final CTA</p>
                <h2 className="mt-3 text-[30px] font-black leading-[1.15] tracking-[-0.03em] md:text-[38px]">
                  この機会に、まずは
                  <br />
                  ご自身に合う進め方かどうかを
                  <br />
                  相談してみませんか
                </h2>
                <p className="mt-4 text-[15px] leading-8 text-white/82">
                  ホームホワイトニングに興味がある方は、スタッフまでお気軽にご相談ください。ご自身に合う進め方かどうかの確認からでも大丈夫です。
                </p>
              </div>

              <div className="w-full max-w-[340px] rounded-[30px] border border-white/14 bg-white/10 p-5 backdrop-blur">
                <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-[#e8d9b0]">Campaign Summary</p>
                <p className="mt-3 text-[17px] font-bold leading-7">ジェル6本 / トレー上下 / ケースセット</p>
                <p className="mt-4 text-[32px] font-black tracking-[-0.03em]">28,000円（税込）</p>
                <p className="mt-2 text-[13px] leading-6 text-white/75">
                  期間: 2026年6月1日（月）〜2026年9月30日（水）
                </p>
                <Link
                  href={ctaHref}
                  className="mt-5 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-white px-6 py-4 text-[15px] font-black text-[#16324f] transition-transform hover:-translate-y-0.5"
                >
                  予約・相談する
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <p className="mt-3 text-[12px] leading-6 text-white/70">
                  現在は仮導線としてお問い合わせページへご案内しています。
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
