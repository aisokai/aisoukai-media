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

const worryItems = [
  { title: '歯科医院で相談した方がいい？', icon: Smile },
  { title: 'しみることはある？', icon: Sparkles },
  { title: '費用はどのくらい？', icon: Gem },
  { title: 'どのくらいの期間が必要？', icon: Clock3 },
]

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

const campaignFacts = [
  { label: '期間', value: '2026年6月1日（月）〜2026年9月30日（水）' },
  { label: '内容', value: 'ジェル6本 / トレー上下 / ケースセット' },
  { label: '相談', value: '仮導線は /contact で受付中' },
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
    <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-[#0d7187]">
      {children}
    </p>
  )
}

function CenterHeading({
  label,
  title,
  body,
}: {
  label: string
  title: string
  body?: string
}) {
  return (
    <div className="mx-auto max-w-[42rem] text-center">
      <SectionLabel>{label}</SectionLabel>
      <h2 className="mt-3 text-[30px] font-medium leading-[1.25] tracking-[-0.03em] text-[#135d73] md:text-[42px]">
        {title}
      </h2>
      {body ? <p className="mt-5 text-[15px] leading-8 text-slate-600">{body}</p> : null}
    </div>
  )
}

function SideHeading({
  label,
  title,
  body,
}: {
  label: string
  title: string
  body?: string
}) {
  return (
    <div className="max-w-[40rem]">
      <SectionLabel>{label}</SectionLabel>
      <h2 className="mt-3 text-[28px] font-medium leading-[1.3] tracking-[-0.03em] text-[#135d73] md:text-[38px]">
        {title}
      </h2>
      {body ? <p className="mt-4 text-[15px] leading-8 text-slate-600">{body}</p> : null}
    </div>
  )
}

export default function HomeWhiteningCampaignPage() {
  return (
    <div className="bg-[#fffdfa] text-slate-800">
      <section className="relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-[28rem] bg-[linear-gradient(180deg,#fffdfa_0%,#f8f4ec_58%,#ffffff_100%)]" />
        <div className="absolute right-[-8rem] top-16 h-64 w-64 rounded-full bg-[#f5ece4] blur-3xl" />
        <div className="absolute left-[-6rem] top-28 h-56 w-56 rounded-full bg-[#eef7f7] blur-3xl" />
        <div className="relative mx-auto max-w-[1120px] px-4 pb-18 pt-8 md:px-6 md:pb-24 md:pt-12">
          <div className="grid gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
            <div className="space-y-7">
              <div className="flex flex-wrap gap-2 text-[12px] font-semibold">
                <span className="rounded-full bg-[#135d73] px-4 py-2 text-white">
                  2026年 ホームホワイトニングキャンペーン
                </span>
                <span className="rounded-full border border-[#efe3d6] bg-white px-4 py-2 text-[#8b6b4a]">
                  期間: 2026年6月1日（月）〜2026年9月30日（水）
                </span>
              </div>

              <div className="space-y-5">
                <p className="text-[13px] font-bold uppercase tracking-[0.28em] text-[#0d7187]">
                  Home Whitening Campaign
                </p>
                <h1 className="max-w-[10em] text-[40px] font-medium leading-[1.18] tracking-[-0.05em] text-[#135d73] sm:text-[54px] md:text-[64px]">
                  歯を白く
                  <br />
                  きれいにしたい
                  <br />
                  あなたへ
                </h1>
                <p className="max-w-[34rem] text-[15px] leading-8 text-slate-600 md:text-[16px]">
                  自宅で少しずつ進めたい方へ向けた、三谷ファミリー歯科クリニックのホームホワイトニングキャンペーンです。
                  価格と内容を分かりやすく整理し、はじめての方でも相談しやすいLPとしてまとめています。
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Link
                  href={ctaHref}
                  className="inline-flex min-h-14 items-center justify-center gap-2 rounded-full bg-[#135d73] px-6 py-4 text-[15px] font-bold text-white shadow-[0_14px_30px_rgba(19,93,115,0.16)] transition-transform hover:-translate-y-0.5"
                >
                  予約・相談する
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <a
                  href="#price"
                  className="inline-flex min-h-14 items-center justify-center rounded-full border border-[#e7d8c8] bg-white px-6 py-4 text-[15px] font-bold text-[#8b6b4a] transition-colors hover:bg-[#fdf7f0]"
                >
                  価格を見る
                </a>
              </div>

              <p className="text-[12px] leading-6 text-slate-500">
                ※ 予約・相談ボタンは現在仮導線としてお問い合わせページへ遷移します。
              </p>
            </div>

            <div className="relative">
              <div className="overflow-hidden rounded-[36px] border border-[#efe3d6] bg-[linear-gradient(135deg,#ffffff_0%,#fcf6ef_44%,#f7fbfb_100%)] p-5 shadow-[0_30px_80px_rgba(109,94,74,0.08)] md:p-7">
                <div className="grid gap-4 md:grid-cols-[0.94fr_1.06fr]">
                  <div className="min-h-[280px] rounded-[28px] bg-[linear-gradient(180deg,#f9f3ec_0%,#ffffff_100%)] p-5">
                    <p className="text-[11px] font-bold uppercase tracking-[0.26em] text-[#0d7187]">
                      Campaign Price
                    </p>
                    <p className="mt-4 text-[18px] leading-8 text-slate-600">
                      ホームホワイトニングジェル6本
                      <br />
                      トレー上下
                      <br />
                      通常ケース代220円もセット
                    </p>
                    <div className="mt-8 border-t border-[#eadfd0] pt-6">
                      <p className="text-[13px] font-semibold text-slate-500">キャンペーン価格</p>
                      <p className="mt-2 text-[38px] font-bold tracking-[-0.04em] text-[#135d73] sm:text-[46px]">
                        28,000円
                        <span className="ml-1 text-[16px] font-medium text-slate-500">（税込）</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col justify-between rounded-[28px] border border-[#ecf3f3] bg-white p-5">
                    <div>
                      <p className="text-[12px] font-bold uppercase tracking-[0.22em] text-[#8b6b4a]">
                        通常内容との比較
                      </p>
                      <div className="mt-4 rounded-[22px] bg-[#faf7f2] p-4">
                        <p className="text-[12px] font-bold text-slate-400">通常</p>
                        <p className="mt-2 text-[15px] font-semibold leading-7 text-[#19475a]">
                          ホームホワイトニングジェル4本
                          <br />
                          + トレー上下
                        </p>
                        <p className="mt-3 text-[28px] font-bold tracking-[-0.03em] text-slate-800">
                          33,000円
                          <span className="ml-1 text-[14px] font-medium text-slate-500">（税込）</span>
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 space-y-3">
                      {campaignFacts.map((fact) => (
                        <div key={fact.label} className="border-t border-[#edf2f2] pt-3">
                          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#0d7187]">
                            {fact.label}
                          </p>
                          <p className="mt-1 text-[14px] leading-6 text-slate-600">{fact.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white">
        <div className="mx-auto max-w-[1120px] px-4 py-16 md:px-6 md:py-22">
          <CenterHeading
            label="Question"
            title="ホワイトニングに興味はあるけど不安…"
            body="はじめて検討する方が気になりやすい点を先に整理し、そのうえでキャンペーン内容と進め方をご案内します。"
          />

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {worryItems.map(({ title, icon: Icon }) => (
              <div
                key={title}
                className="rounded-[30px] border border-[#edf3f3] bg-[#fcfefd] px-5 py-7 text-center shadow-[0_10px_24px_rgba(49,86,95,0.04)]"
              >
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-[#dbe8eb] text-[#1c9ab5]">
                  <Icon className="h-6 w-6" />
                </div>
                <p className="mt-5 text-[20px] font-medium leading-8 tracking-[-0.02em] text-[#135d73]">
                  {title}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[linear-gradient(180deg,#fffdfa_0%,#fcf7f1_100%)]">
        <div className="mx-auto max-w-[1120px] px-4 py-16 md:px-6 md:py-22">
          <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="space-y-8">
              <SideHeading
                label="Concern"
                title="まずは、お悩みや不安から"
                body="自己判断で始める前に、ホームホワイトニングがご自身に合っているかを確認しやすい構成にしています。"
              />
              <ul className="space-y-4">
                {concernItems.map((item) => (
                  <li
                    key={item}
                    className="rounded-[24px] border border-[#efe5da] bg-white px-5 py-5 text-[15px] leading-8 text-slate-700"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-[34px] border border-[#efe5da] bg-white px-6 py-7 shadow-[0_16px_40px_rgba(93,81,60,0.06)]">
              <SideHeading
                label="Why Consult"
                title="歯科医院で相談しながら始める理由"
                body="ホームホワイトニングはご自宅で進めやすい方法ですが、お口の状態によっては事前に確認した方がよいケースがあります。"
              />

              <div className="mt-8 space-y-5">
                {clinicReasons.map((reason) => (
                  <div key={reason.title} className="border-t border-[#edf2f2] pt-5 first:border-t-0 first:pt-0">
                    <h3 className="text-[22px] font-medium tracking-[-0.02em] text-[#135d73]">{reason.title}</h3>
                    <p className="mt-3 text-[15px] leading-8 text-slate-600">{reason.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="price" className="bg-white">
        <div className="mx-auto max-w-[1120px] px-4 py-16 md:px-6 md:py-22">
          <CenterHeading
            label="Price"
            title="キャンペーン内容と価格"
            body="価格は見やすく、ただし煽りすぎない形で整理しています。通常内容との違いもあわせてご確認ください。"
          />

          <div className="mt-10 overflow-hidden rounded-[36px] border border-[#e7dccc] bg-[#fffdfa]">
            <div className="grid gap-0 md:grid-cols-2">
              <div className="border-b border-[#eee3d4] px-6 py-7 md:border-b-0 md:border-r">
                <p className="text-[12px] font-bold uppercase tracking-[0.22em] text-slate-400">通常</p>
                <p className="mt-4 text-[20px] font-medium leading-8 tracking-[-0.02em] text-[#135d73]">
                  ホームホワイトニングジェル4本 + トレー上下
                </p>
                <p className="mt-6 text-[40px] font-bold tracking-[-0.04em] text-slate-800">
                  33,000円
                  <span className="ml-1 text-[16px] font-medium text-slate-500">（税込）</span>
                </p>
              </div>

              <div className="bg-[linear-gradient(180deg,#fcf7f0_0%,#fffdfa_100%)] px-6 py-7">
                <p className="text-[12px] font-bold uppercase tracking-[0.22em] text-[#0d7187]">キャンペーン</p>
                <p className="mt-4 text-[20px] font-medium leading-8 tracking-[-0.02em] text-[#135d73]">
                  ホームホワイトニングジェル6本 + トレー上下 + 通常ケース代220円もセット
                </p>
                <p className="mt-6 text-[44px] font-bold tracking-[-0.05em] text-[#135d73]">
                  28,000円
                  <span className="ml-1 text-[16px] font-medium text-slate-500">（税込）</span>
                </p>
              </div>
            </div>

            <div className="grid gap-0 border-t border-[#eee3d4] sm:grid-cols-3">
              <div className="border-b border-[#eee3d4] px-6 py-5 text-[15px] leading-7 text-slate-600 sm:border-b-0 sm:border-r">
                ジェル6本
              </div>
              <div className="border-b border-[#eee3d4] px-6 py-5 text-[15px] leading-7 text-slate-600 sm:border-b-0 sm:border-r">
                トレー上下
              </div>
              <div className="px-6 py-5 text-[15px] leading-7 text-slate-600">
                通常ケース代220円もセット
              </div>
            </div>
          </div>

          <div className="mt-8 rounded-[30px] border border-[#edf3f3] bg-[#fbfdfd] px-6 py-7">
            <div className="grid gap-5 md:grid-cols-3">
              {featureCards.map(({ title, body, icon: Icon }) => (
                <div key={title}>
                  <div className="flex h-12 w-12 items-center justify-center rounded-full border border-[#dbe8eb] text-[#1c9ab5]">
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="mt-4 text-[20px] font-medium tracking-[-0.02em] text-[#135d73]">{title}</h3>
                  <p className="mt-3 text-[14px] leading-7 text-slate-600">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[linear-gradient(180deg,#fffdfa_0%,#f8fbfb_100%)]">
        <div className="mx-auto max-w-[1120px] px-4 py-16 md:px-6 md:py-22">
          <CenterHeading
            label="Recommended"
            title="こんな方におすすめです"
            body="急激な変化を求めるよりも、ご自宅で無理なく続けたい方に向いているキャンペーンです。"
          />
          <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {recommendedItems.map((item) => (
              <div
                key={item}
                className="rounded-[26px] border border-[#e5ecec] bg-white px-5 py-5 text-[15px] leading-7 text-slate-700"
              >
                <div className="flex gap-3">
                  <Check className="mt-1 h-5 w-5 shrink-0 text-[#0d7187]" />
                  <span>{item}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-10 rounded-[34px] border border-[#efe5da] bg-white px-6 py-7 shadow-[0_16px_40px_rgba(93,81,60,0.05)]">
            <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
              <div className="max-w-[37rem]">
                <SectionLabel>Consultation CTA</SectionLabel>
                <h3 className="mt-3 text-[28px] font-medium leading-[1.3] tracking-[-0.03em] text-[#135d73]">
                  はじめる前に、まずは内容確認から
                </h3>
                <p className="mt-3 text-[15px] leading-8 text-slate-600">
                  ご相談だけでも問題ありません。お口の状態を確認しながら、進め方をご案内します。
                </p>
              </div>
              <Link
                href={ctaHref}
                className="inline-flex min-h-14 items-center justify-center gap-2 rounded-full bg-[#135d73] px-6 py-4 text-[15px] font-bold text-white shadow-[0_14px_28px_rgba(19,93,115,0.15)] transition-transform hover:-translate-y-0.5"
              >
                予約・相談する
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white">
        <div className="mx-auto max-w-[1120px] px-4 py-16 md:px-6 md:py-22">
          <SideHeading
            label="Flow"
            title="ご相談から開始までの流れ"
            body="スマホでも縦に読み進めやすいよう、流れはステップごとに整理しています。"
          />

          <div className="mt-10 space-y-8">
            {flowSteps.map((step, index) => (
              <div
                key={step.title}
                className="grid gap-4 border-t border-[#e9e6df] pt-6 md:grid-cols-[210px_1fr]"
              >
                <div className="flex items-center gap-4 text-[#135d73]">
                  <div className="h-px w-14 bg-[#135d73]" />
                  <p className="text-[18px] font-medium tracking-[-0.02em]">
                    step {String(index + 1).padStart(2, '0')}
                  </p>
                </div>
                <div>
                  <h3 className="text-[30px] font-medium leading-[1.25] tracking-[-0.03em] text-[#135d73]">
                    {step.title}
                  </h3>
                  <p className="mt-4 max-w-[44rem] text-[15px] leading-8 text-slate-600">{step.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[linear-gradient(180deg,#fffdfa_0%,#fcf7f1_100%)]">
        <div className="mx-auto max-w-[1120px] px-4 py-16 md:px-6 md:py-22">
          <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="rounded-[34px] border border-[#efe5da] bg-white px-6 py-7">
              <SideHeading
                label="Caution"
                title="注意事項"
                body="安心してご相談いただくため、あらかじめ知っておきたい点をまとめています。"
              />
              <ul className="mt-7 space-y-4">
                {cautions.map((item) => (
                  <li key={item} className="flex gap-3 text-[15px] leading-8 text-slate-600">
                    <ShieldCheck className="mt-1 h-5 w-5 shrink-0 text-[#c89f65]" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div id="faq" className="rounded-[34px] border border-[#e5ecec] bg-[#fbfdfd] px-6 py-7">
              <SideHeading
                label="FAQ"
                title="よくある質問"
                body="はじめて相談する方が気になりやすい内容を先に確認できるようにしています。"
              />
              <div className="mt-7 space-y-5">
                {faqs.map((faq) => (
                  <div key={faq.question} className="border-t border-[#e8eff0] pt-5 first:border-t-0 first:pt-0">
                    <div className="flex gap-3">
                      <CircleHelp className="mt-1 h-5 w-5 shrink-0 text-[#0d7187]" />
                      <div>
                        <h3 className="text-[19px] font-medium tracking-[-0.02em] text-[#135d73]">
                          {faq.question}
                        </h3>
                        <p className="mt-3 text-[15px] leading-8 text-slate-600">{faq.answer}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white">
        <div className="mx-auto max-w-[1120px] px-4 pb-18 pt-6 md:px-6 md:pb-24">
          <div className="rounded-[40px] border border-[#efe5da] bg-[linear-gradient(135deg,#fffdfa_0%,#f8f4ec_52%,#f6fbfb_100%)] px-6 py-8 shadow-[0_18px_46px_rgba(101,86,65,0.06)] md:px-10 md:py-10">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-[40rem]">
                <SectionLabel>Final CTA</SectionLabel>
                <h2 className="mt-3 text-[32px] font-medium leading-[1.25] tracking-[-0.04em] text-[#135d73] md:text-[44px]">
                  この機会に、
                  <br />
                  ご自身に合う進め方かどうかを
                  <br />
                  相談してみませんか
                </h2>
                <p className="mt-4 text-[15px] leading-8 text-slate-600">
                  ホームホワイトニングに興味がある方は、スタッフまでお気軽にご相談ください。相談だけでも問題ありません。
                </p>
              </div>

              <div className="w-full max-w-[340px] rounded-[30px] border border-white bg-white/90 p-5">
                <p className="text-[12px] font-bold uppercase tracking-[0.22em] text-[#0d7187]">
                  Campaign Summary
                </p>
                <p className="mt-4 text-[16px] leading-7 text-slate-600">
                  ジェル6本 / トレー上下 / ケースセット
                </p>
                <p className="mt-3 text-[36px] font-bold tracking-[-0.04em] text-[#135d73]">28,000円（税込）</p>
                <p className="mt-2 text-[13px] leading-6 text-slate-500">
                  期間: 2026年6月1日（月）〜2026年9月30日（水）
                </p>
                <Link
                  href={ctaHref}
                  className="mt-5 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-[#135d73] px-6 py-4 text-[15px] font-bold text-white transition-transform hover:-translate-y-0.5"
                >
                  予約・相談する
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <p className="mt-3 text-[12px] leading-6 text-slate-500">
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
