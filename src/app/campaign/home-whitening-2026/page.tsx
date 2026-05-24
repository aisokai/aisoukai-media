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
    <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#5db7c5]">
      {children}
    </p>
  )
}

export default function HomeWhiteningCampaignPage() {
  return (
    <div className="bg-[#f7fbfc] text-slate-800">
      <section className="relative overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(143,220,233,0.22),transparent_34%),linear-gradient(180deg,#ffffff_0%,#f8fbfe_62%,#eef8fb_100%)]">
        <div className="absolute inset-x-0 top-0 h-24 bg-[linear-gradient(90deg,rgba(255,255,255,0)_0%,rgba(226,202,142,0.34)_50%,rgba(255,255,255,0)_100%)]" />
        <div className="mx-auto max-w-[1120px] px-4 pb-12 pt-8 md:px-6 md:pb-16 md:pt-10">
          <div className="rounded-[32px] border border-[#d7eef2] bg-white/90 p-4 shadow-[0_20px_70px_rgba(38,93,127,0.10)] backdrop-blur sm:p-6 lg:p-8">
            <div className="grid gap-8 lg:grid-cols-[1.08fr_0.92fr] lg:items-start">
              <div className="space-y-6">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-[#103d6d] px-4 py-2 text-[12px] font-bold text-white">
                    2026年キャンペーン
                  </span>
                  <span className="rounded-full border border-[#cfe7eb] bg-[#f4fcfd] px-4 py-2 text-[12px] font-semibold text-[#20687c]">
                    実施期間: 2026年6月1日（月）〜2026年9月30日（水）
                  </span>
                </div>

                <div className="space-y-4">
                  <p className="text-[14px] font-semibold tracking-[0.16em] text-[#5db7c5]">
                    HOME WHITENING CAMPAIGN
                  </p>
                  <h1 className="max-w-[10em] text-[38px] font-black leading-[1.08] tracking-[-0.03em] text-[#163b67] sm:text-[46px]">
                    2026年
                    <br />
                    ホームホワイトニング
                    <br />
                    キャンペーン
                  </h1>
                  <p className="max-w-[34rem] text-[15px] leading-7 text-slate-600">
                    歯科医院で専用トレーを作製し、ご自宅で少しずつ進めるホームホワイトニングです。
                    今回は、始めやすさを重視したキャンペーン内容でご案内しています。
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[28px] border border-[#e7edf3] bg-[#fbfdff] p-5">
                    <div className="flex items-center gap-2 text-[#163b67]">
                      <Smile className="h-5 w-5" />
                      <p className="text-[13px] font-bold">こんな方におすすめ</p>
                    </div>
                    <ul className="mt-4 space-y-2 text-[14px] leading-6 text-slate-600">
                      <li>歯の黄ばみが気になる方</li>
                      <li>自然な白さを目指したい方</li>
                      <li>自宅で無理なく始めたい方</li>
                    </ul>
                  </div>
                  <div className="rounded-[28px] border border-[#e8dcc0] bg-[linear-gradient(180deg,#fffdf8_0%,#faf2dd_100%)] p-5">
                    <div className="flex items-center gap-2 text-[#886425]">
                      <Gem className="h-5 w-5" />
                      <p className="text-[13px] font-bold">キャンペーンの要点</p>
                    </div>
                    <ul className="mt-4 space-y-2 text-[14px] leading-6 text-slate-600">
                      <li>ジェル6本</li>
                      <li>トレー上下</li>
                      <li>通常ケース代220円もセット</li>
                    </ul>
                  </div>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <Link
                    href={ctaHref}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-[#0f4f8c] px-6 py-4 text-[15px] font-bold text-white shadow-[0_14px_30px_rgba(15,79,140,0.28)] transition-transform hover:-translate-y-0.5"
                  >
                    予約・相談する
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <a
                    href="#faq"
                    className="inline-flex items-center justify-center rounded-full border border-[#cae6ec] bg-white px-6 py-4 text-[15px] font-bold text-[#20687c] transition-colors hover:bg-[#f3fbfd]"
                  >
                    よくある質問を見る
                  </a>
                </div>
                <p className="text-[12px] leading-6 text-slate-500">
                  ※ 予約・相談ボタンは現在仮導線としてお問い合わせページへ遷移します。後日、予約URL等へ差し替える可能性があります。
                </p>
              </div>

              <div className="relative">
                <div className="absolute -right-3 top-6 h-40 w-40 rounded-full bg-[radial-gradient(circle,#f9df7e_0%,#e1b948_55%,#ba8b1e_100%)] blur-[2px] sm:h-48 sm:w-48" />
                <div className="relative space-y-4">
                  <div className="rounded-[32px] border border-[#edf2f6] bg-[linear-gradient(135deg,#ffffff_0%,#f9fcff_35%,#f1f8fb_100%)] p-4 shadow-[0_18px_40px_rgba(27,70,103,0.08)] sm:p-5">
                    <div className="grid gap-3 sm:grid-cols-[0.9fr_1.1fr]">
                      <div className="rounded-[24px] border border-[#e7edf3] bg-white p-4">
                        <p className="text-[12px] font-bold text-slate-400">通常</p>
                        <p className="mt-3 text-[15px] font-bold leading-7 text-[#163b67]">
                          ホームホワイトニング
                          <br />
                          ジェル4本 + トレー上下
                        </p>
                        <p className="mt-4 text-[21px] font-black text-slate-900">33,000円<span className="text-[14px]">（税込）</span></p>
                      </div>
                      <div className="relative overflow-hidden rounded-[28px] border border-[#e7d4a5] bg-[radial-gradient(circle_at_top_right,rgba(255,244,190,0.95),rgba(238,198,88,0.92) 36%,rgba(190,133,28,0.92) 100%)] p-5 text-[#2f2006]">
                        <p className="text-[15px] font-black tracking-[0.04em] text-white drop-shadow-[0_1px_4px_rgba(90,58,0,0.45)]">
                          キャンペーン価格
                        </p>
                        <p className="mt-3 text-[17px] font-bold leading-7">
                          ホームホワイトニング
                          <br />
                          ジェル6本 + トレー上下
                        </p>
                        <p className="mt-4 text-[30px] font-black leading-none text-white drop-shadow-[0_2px_8px_rgba(90,58,0,0.38)]">
                          28,000円
                          <span className="ml-1 text-[16px]">（税込）</span>
                        </p>
                        <p className="mt-4 inline-block rounded-full bg-[rgba(82,52,0,0.22)] px-3 py-2 text-[13px] font-bold text-white">
                          通常ケース代220円もセット
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-[24px] border border-[#d7eef2] bg-white p-4">
                      <p className="text-[12px] font-bold text-[#20687c]">対象</p>
                      <p className="mt-2 text-[14px] font-semibold leading-6 text-slate-700">
                        自宅で無理なく
                        <br />
                        始めたい方
                      </p>
                    </div>
                    <div className="rounded-[24px] border border-[#d7eef2] bg-white p-4">
                      <p className="text-[12px] font-bold text-[#20687c]">方式</p>
                      <p className="mt-2 text-[14px] font-semibold leading-6 text-slate-700">
                        専用トレーを
                        <br />
                        ご自宅で使用
                      </p>
                    </div>
                    <div className="rounded-[24px] border border-[#d7eef2] bg-white p-4">
                      <p className="text-[12px] font-bold text-[#20687c]">相談</p>
                      <p className="mt-2 text-[14px] font-semibold leading-6 text-slate-700">
                        お口の状態を
                        <br />
                        確認して案内
                      </p>
                    </div>
                  </div>

                  <div className="rounded-[28px] border border-dashed border-[#c6dfe5] bg-[#f6fcfd] p-4 text-[13px] leading-6 text-slate-500">
                    チラシ画像の雰囲気を参考に、院内の清潔感とキャンペーン感が伝わるよう再構成しています。画像素材を追加する場合は、このブロック周辺に差し込みやすい構成です。
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-[#dbeef1] bg-white">
        <div className="mx-auto max-w-[1120px] px-4 py-6 md:px-6">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-[24px] bg-[#f3fbfd] px-4 py-4">
              <p className="text-[12px] font-bold text-[#20687c]">価格</p>
              <p className="mt-2 text-[24px] font-black text-[#163b67]">28,000円（税込）</p>
            </div>
            <div className="rounded-[24px] bg-[#fdfaf1] px-4 py-4">
              <p className="text-[12px] font-bold text-[#9a7a2d]">期間</p>
              <p className="mt-2 text-[16px] font-bold leading-7 text-slate-800">2026年6月1日（月）〜2026年9月30日（水）</p>
            </div>
            <div className="rounded-[24px] bg-[#f5f9ff] px-4 py-4">
              <p className="text-[12px] font-bold text-[#0f4f8c]">内容</p>
              <p className="mt-2 text-[16px] font-bold leading-7 text-slate-800">ジェル6本 / トレー上下 / ケースセット</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1120px] space-y-14 px-4 py-12 md:px-6 md:py-16">
        <div className="grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
          <div className="rounded-[32px] border border-[#d7eef2] bg-white p-6 shadow-sm">
            <SectionLabel>Recommended</SectionLabel>
            <h2 className="mt-3 text-[28px] font-black leading-tight text-[#163b67]">こんな方におすすめです</h2>
            <ul className="mt-6 space-y-4">
              {recommendedItems.map((item) => (
                <li key={item} className="flex gap-3 rounded-2xl bg-[#f6fcfd] p-4 text-[15px] leading-7 text-slate-700">
                  <Check className="mt-1 h-5 w-5 shrink-0 text-[#44b6c9]" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-[32px] border border-[#e6dcc2] bg-[linear-gradient(180deg,#fffef9_0%,#f9f2df_100%)] p-6 shadow-sm">
            <SectionLabel>Campaign Summary</SectionLabel>
            <h2 className="mt-3 text-[28px] font-black leading-tight text-[#163b67]">まず確認したいポイント</h2>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="rounded-[24px] bg-white p-5">
                <p className="text-[13px] font-bold text-[#9a7a2d]">通常との違い</p>
                <p className="mt-2 text-[15px] leading-7 text-slate-700">
                  ジェルが4本から6本へ増え、ケース代220円もセットになります。
                </p>
              </div>
              <div className="rounded-[24px] bg-white p-5">
                <p className="text-[13px] font-bold text-[#9a7a2d]">進め方</p>
                <p className="mt-2 text-[15px] leading-7 text-slate-700">
                  歯科医院でトレーを作製し、ご自宅で無理なく継続していく方法です。
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-[36px] border border-[#d7eef2] bg-white p-6 shadow-sm md:p-8">
          <SectionLabel>Features</SectionLabel>
          <h2 className="mt-3 text-[30px] font-black leading-tight text-[#163b67]">ホームホワイトニングの特徴</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {featureCards.map(({ title, body, icon: Icon }) => (
              <div key={title} className="rounded-[26px] bg-[linear-gradient(180deg,#f7fdfe_0%,#eef8fb_100%)] p-5">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-[#44b6c9]">
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="mt-4 text-[18px] font-bold text-[#163b67]">{title}</h3>
                <p className="mt-3 text-[14px] leading-7 text-slate-600">{body}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[36px] border border-[#d7eef2] bg-white p-6 shadow-sm md:p-8">
          <SectionLabel>Comparison</SectionLabel>
          <h2 className="mt-3 text-[30px] font-black leading-tight text-[#163b67]">院内ホワイトニングとの違い</h2>
          <p className="mt-3 max-w-[42rem] text-[15px] leading-7 text-slate-600">
            今回のキャンペーンはホームホワイトニングが対象です。院内ホワイトニングとは進め方が異なります。
          </p>
          <div className="mt-6 overflow-hidden rounded-[28px] border border-[#d7eef2]">
            <div className="grid grid-cols-[0.95fr_1fr_1fr] bg-[#163b67] text-[13px] font-bold text-white">
              <div className="px-4 py-4">項目</div>
              <div className="bg-[#0f4f8c] px-4 py-4">ホームホワイトニング</div>
              <div className="bg-[#3d779b] px-4 py-4">院内ホワイトニング</div>
            </div>
            {comparisonRows.map((row, index) => (
              <div
                key={row.item}
                className={`grid grid-cols-[0.95fr_1fr_1fr] text-[14px] ${
                  index % 2 === 0 ? 'bg-white' : 'bg-[#f8fcfd]'
                }`}
              >
                <div className="border-t border-[#d7eef2] px-4 py-4 font-bold text-slate-800">{row.item}</div>
                <div className="border-t border-[#d7eef2] px-4 py-4 text-slate-600">{row.home}</div>
                <div className="border-t border-[#d7eef2] px-4 py-4 text-slate-600">{row.office}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-[36px] border border-[#d7eef2] bg-white p-6 shadow-sm md:p-8">
            <SectionLabel>Flow</SectionLabel>
            <h2 className="mt-3 text-[30px] font-black leading-tight text-[#163b67]">治療の流れ</h2>
            <div className="mt-6 space-y-4">
              {flowSteps.map((step, index) => (
                <div key={step.title} className="flex gap-4 rounded-[24px] bg-[#f6fcfd] p-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#0f4f8c] text-[15px] font-black text-white">
                    {index + 1}
                  </div>
                  <div>
                    <h3 className="text-[17px] font-bold text-[#163b67]">{step.title}</h3>
                    <p className="mt-2 text-[14px] leading-7 text-slate-600">{step.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[36px] border border-[#e6dcc2] bg-[linear-gradient(180deg,#fffef8_0%,#fbf3df_100%)] p-6 shadow-sm md:p-8">
            <SectionLabel>Caution</SectionLabel>
            <h2 className="mt-3 text-[30px] font-black leading-tight text-[#163b67]">注意事項</h2>
            <ul className="mt-6 space-y-4">
              {cautions.map((item) => (
                <li key={item} className="flex gap-3 rounded-[22px] bg-white p-4 text-[14px] leading-7 text-slate-600">
                  <ShieldCheck className="mt-1 h-5 w-5 shrink-0 text-[#b89542]" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <section id="faq" className="rounded-[36px] border border-[#d7eef2] bg-white p-6 shadow-sm md:p-8">
          <SectionLabel>FAQ</SectionLabel>
          <h2 className="mt-3 text-[30px] font-black leading-tight text-[#163b67]">よくある質問</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {faqs.map((faq) => (
              <div key={faq.question} className="rounded-[26px] bg-[#f6fcfd] p-5">
                <div className="flex gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-[#44b6c9]">
                    <CircleHelp className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-[16px] font-bold leading-7 text-[#163b67]">{faq.question}</h3>
                    <p className="mt-2 text-[14px] leading-7 text-slate-600">{faq.answer}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="overflow-hidden rounded-[38px] border border-[#d7eef2] bg-[linear-gradient(135deg,#163b67_0%,#0f4f8c_55%,#4bb5c7_140%)] px-6 py-8 text-white shadow-[0_24px_70px_rgba(15,79,140,0.22)] md:px-10 md:py-10">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-[36rem]">
              <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#d7f5fa]">
                Final CTA
              </p>
              <h2 className="mt-3 text-[32px] font-black leading-tight">この機会に、憧れの白い歯へ。</h2>
              <p className="mt-4 text-[15px] leading-7 text-white/80">
                ホームホワイトニングに興味がある方は、スタッフまでお気軽にご相談ください。ご自身に合う進め方かどうかの確認からでも大丈夫です。
              </p>
            </div>
            <div className="w-full max-w-[320px] shrink-0 rounded-[30px] bg-white/12 p-4 backdrop-blur">
              <p className="text-[13px] font-bold text-[#d7f5fa]">キャンペーン内容</p>
              <p className="mt-2 text-[17px] font-bold">ジェル6本 / トレー上下 / ケースセット</p>
              <p className="mt-3 text-[30px] font-black">28,000円（税込）</p>
              <Link
                href={ctaHref}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-white px-6 py-4 text-[15px] font-black text-[#0f4f8c] transition-transform hover:-translate-y-0.5"
              >
                予約・相談する
                <ArrowRight className="h-4 w-4" />
              </Link>
              <p className="mt-3 text-[12px] leading-6 text-white/75">
                現在は仮導線としてお問い合わせページへご案内しています。
              </p>
            </div>
          </div>
        </section>
      </section>
    </div>
  )
}
