import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import {
  ArrowRight,
  Check,
  CircleHelp,
  Clock3,
  Gem,
  ShieldCheck,
  Smile,
  Sparkles,
  Calendar,
  Gift,
  Plus,
} from 'lucide-react'
import { buildCanonicalUrl, SITE_NAME } from '@/lib/seo'

const pagePath = '/campaign/home-whitening-2026'
const ctaHref = '/contact'

const worryItems = [
  { title: '歯科医院で相談した方がいい？', desc: 'お口の健康状態や適性をプロの目で事前にしっかりと診査します。', icon: Smile },
  { title: 'しみることはある？', desc: '知覚過敏が出る場合もありますが、症状に応じた使い方をサポートします。', icon: Sparkles },
  { title: '費用はどのくらい？', desc: 'キャンペーン価格で通常よりお得に、明瞭な料金プランで始められます。', icon: Gem },
  { title: 'どのくらいの期間が必要？', desc: '自宅で数週間、ご自身のペースで少しずつ白さを目指せます。', icon: Clock3 },
]

const concernItems = [
  { title: '何を選べばよいか分からず不安', body: 'ホワイトニングには様々な方法があり、自己判断で強い薬剤を使うとトラブルになることがあります。' },
  { title: '市販品や自己流で効果が出ない', body: 'サロンや市販品では使えない、歯科医院専売の薬剤を一人ひとりに合わせて処方します。' },
  { title: 'しみたり痛んだりしないか心配', body: '事前にお口の健康状態（むし歯や歯周病など）を確認し、適切なタイミングで開始します。' },
]

const clinicReasons = [
  {
    title: '精密なオーダーメイドトレーの作製',
    body: '患者様の歯並びにぴったりフィットする専用マウスピースを作製するため、薬剤がムラなく均一に行き渡り、高いホワイトニング効果が期待できます。',
  },
  {
    title: '事前のお口全体のトータルチェック',
    body: 'むし歯や歯周病がある状態でホワイトニングを行うと強い痛みが生じることがあります。歯科医師がチェックし、安全に開始できるかを見極めます。',
  },
  {
    title: '副作用やトラブル時の充実したサポート',
    body: '万が一「しみる」「痛みが出る」といった知覚過敏の症状が現れた場合も、薬剤の濃度調整や知覚過敏抑制処置など、速やかに適切な対応が可能です。',
  },
]

const flowSteps = [
  {
    step: '01',
    title: 'ご相談・ご予約',
    body: 'まずはお気軽にお問い合わせください。現在の歯の色に関するお悩みや、いつまでに白くしたいかなどのご要望を丁寧にお伺いします。',
    image: '/images/library/preventive/preventive-33802469.jpg',
  },
  {
    step: '02',
    title: 'お口の診察・クリーニング',
    body: '歯科医師がむし歯や歯周病、着色の状態を確認します。効果を高めるために、歯の表面の汚れを事前に専用機器できれいにクリーニングします。',
    image: '/images/library/preventive/preventive-3986645.jpg',
  },
  {
    step: '03',
    title: '専用トレー（マウスピース）の型取り',
    body: '患者様の歯並びに合わせた専用マウスピースを作製するため、上下の歯型取りを行います。数日〜1週間程度でトレーが完成します。',
    image: '/images/library/preventive/preventive-34389468.jpg',
  },
  {
    step: '04',
    title: 'ホワイトニングキットのお渡し',
    body: '完成した専用トレー、ホワイトニングジェル6本、通常220円の専用ケースをセットでお渡しします。ご自宅での使用手順や注意点を詳しく説明します。',
    image: '/images/library/preventive/preventive-34197345.jpg',
  },
  {
    step: '05',
    title: 'ご自宅でのケア開始・経過観察',
    body: '説明書に沿って、ご自宅でお好きな時間にケアを進めていただきます。定期的なお口の検診もあわせて行うことで、白さと健康を維持します。',
    image: '/images/library/preventive/preventive-34558722.jpg',
  },
]

const cautions = [
  '効果には個人差があります。元の歯の色や質によって白くなり方や期間が異なります。',
  'むし歯・歯周病がある場合は、痛みを防ぐため先に治療を優先することがあります。',
  '詰め物・被せ物、神経を失った歯はホワイトニングでは白くなりません。',
  '施術中や施術後に、一時的に知覚過敏（歯がしみる症状）が出る場合があります。',
  '妊娠中・授乳中の方、無カタラーゼ症の方は本治療を受けられません。',
]

const faqs = [
  {
    question: 'ホームホワイトニングとオフィスホワイトニングの違いは何ですか？',
    answer: 'オフィスホワイトニングは歯科医院で強い光を当てて短期間で白くする方法です。一方、ホームホワイトニングはご自宅で専用トレーに薬剤を注入し、毎日数時間装着して少しずつ白くします。時間はかかりますが、色が後戻りしにくく、自然で透明感のある白さに仕上がるのが特徴です。',
  },
  {
    question: 'どれくらいで効果を実感できますか？',
    answer: '個人差がありますが、毎日適切に使用した場合、約1〜2週間程度で「少し白くなってきた」と実感される方が多いです。希望の白さに達するまでには、約3〜4週間継続することをおすすめしています。',
  },
  {
    question: '使用中に歯がしみたときはどうすればよいですか？',
    answer: '一時的な知覚過敏の可能性があります。一旦使用を1日おきにするか、装着時間を短縮してください。症状が治まらない場合は使用を中止し、当院までご連絡ください。知覚過敏を抑える処置やジェルの調整を行います。',
  },
  {
    question: 'ホワイトニング期間中に避けるべき食べ物はありますか？',
    answer: 'ジェルを塗布した直後は特に着色しやすくなっているため、カレー、コーヒー、紅茶、赤ワイン、ケチャップなど色の濃い食べ物・飲み物や喫煙はできるだけ避けていただくことをおすすめします。',
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

export default function HomeWhiteningCampaignPage() {
  return (
    <div className="bg-[#fdfcf9] text-slate-800 antialiased">
      {/* ヒーローセクション */}
      <section className="relative overflow-hidden bg-gradient-to-b from-[#f7f2ea] via-[#fdfcf9] to-[#ffffff] pb-16 pt-8 md:pb-24 md:pt-16">
        {/* 背景装飾 */}
        <div className="absolute right-[-10rem] top-[-5rem] h-96 w-96 rounded-full bg-[#ebdccb] opacity-40 blur-3xl" />
        <div className="absolute left-[-10rem] top-[15rem] h-80 w-80 rounded-full bg-[#d0e5ea] opacity-40 blur-3xl" />

        <div className="relative mx-auto max-w-[1160px] px-4 md:px-6">
          <div className="grid gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            {/* 左側：キャッチコピーと導入 */}
            <div className="space-y-6 md:space-y-8">
              <div className="inline-flex flex-wrap items-center gap-2 text-[12px] font-bold">
                <span className="rounded-full bg-[#0f3d4a] px-4 py-2 text-[11px] tracking-wider text-white shadow-sm">
                  2026年 ホームホワイトニングキャンペーン
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-[#e5d4bf] bg-white/80 px-4 py-2 text-[11px] font-semibold text-[#8b6b4a]">
                  <Calendar className="h-3.5 w-3.5" />
                  期間: 2026年6月1日(月) 〜 9月30日(水)
                </span>
              </div>

              <div className="space-y-4">
                <p className="text-[12px] font-bold uppercase tracking-[0.3em] text-[#8b6b4a] md:text-[14px]">
                  Beautiful & Healthy White Smile
                </p>
                <h1 className="font-serif-jp text-[36px] font-medium leading-[1.3] tracking-normal text-[#0f3d4a] sm:text-[48px] lg:text-[56px]">
                  憧れの白い歯で、
                  <br />
                  もっと輝く
                  <br className="sm:hidden" />
                  笑顔の毎日へ。
                </h1>
                <p className="max-w-[36rem] text-[14px] leading-relaxed text-slate-600 md:text-[16px] md:leading-8">
                  自宅で無理なく、自分のペースで進められるホームホワイトニング。
                  三谷ファミリー歯科クリニックでは、お口の健康状態をしっかり診査・ケアした上で、一人ひとりに最適なオーダーメイドトレーと高品質な薬剤をご用意します。
                </p>
              </div>

              <div className="flex flex-col gap-4 sm:flex-row">
                <Link
                  href={ctaHref}
                  className="group inline-flex min-h-14 items-center justify-center gap-2 rounded-full bg-[#0f3d4a] px-8 py-4 text-[15px] font-bold text-white shadow-[0_10px_25px_rgba(15,61,74,0.25)] transition-all hover:bg-[#1a5566] hover:shadow-[0_12px_30px_rgba(15,61,74,0.35)]"
                >
                  スタッフに無料相談・予約する
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
                <a
                  href="#price-details"
                  className="inline-flex min-h-14 items-center justify-center rounded-full border border-[#e2d0bd] bg-white px-8 py-4 text-[15px] font-bold text-[#8b6b4a] transition-all hover:bg-[#fbf7f1] hover:border-[#d4bfa8]"
                >
                  キャンペーン価格を見る
                </a>
              </div>
              <p className="text-[11px] text-slate-500">
                ※「相談・予約」ボタンは現在仮の窓口としてお問い合わせページへ遷移します。
              </p>
            </div>

            {/* 右側：ゴールドキャンペーン価格バッジ */}
            <div className="relative mx-auto w-full max-w-[420px] lg:max-w-none">
              {/* 白大理石風のトレーを背景としたカード */}
              <div className="relative overflow-hidden rounded-[32px] border border-[#ebdccb]/60 bg-gradient-to-br from-white via-[#fdfcfb] to-[#f4f7f8] p-6 shadow-[0_20px_50px_rgba(139,107,74,0.12)] md:p-8">
                
                {/* 斜めのキャンペーン帯 */}
                <div className="absolute -left-12 top-6 -rotate-45 bg-gradient-to-r from-amber-500 to-amber-600 px-12 py-1 text-center text-[10px] font-bold tracking-wider text-white shadow-sm">
                  特別価格
                </div>

                {/* ホームホワイトニング特別セット画像 */}
                <div className="relative mb-6 h-48 w-full overflow-hidden rounded-2xl border border-slate-100 shadow-sm">
                  <Image
                    src="/images/library/preventive/preventive-34197349.jpg"
                    alt="三谷ファミリー歯科クリニックのホームホワイトニング特別セット（マウスピース型専用トレーとジェル6本）"
                    fill
                    className="object-cover"
                    priority
                  />
                </div>

                <div className="text-center">
                  <p className="font-serif-jp text-[16px] font-medium tracking-wider text-[#8b6b4a]">
                    HOME WHITENING KIT
                  </p>
                  <h2 className="mt-2 font-serif-jp text-[22px] font-bold text-[#0f3d4a]">
                    ホームホワイトニング特別セット
                  </h2>
                  <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#f4ece3] px-3 py-1 text-[11px] font-bold text-[#8b6b4a]">
                    <Gift className="h-3.5 w-3.5" />
                    通常ケース代 ¥220 もセット！
                  </div>
                </div>

                {/* メインのゴールド価格サークルバッジ */}
                <div className="mx-auto my-6 flex h-[240px] w-[240px] flex-col items-center justify-center rounded-full border-4 border-white bg-gradient-to-br from-[#f8e4b7] via-[#d4af37] to-[#aa8314] text-white shadow-[0_12px_30px_rgba(212,175,55,0.4),inset_0_2px_4px_rgba(255,255,255,0.4)]">
                  <span className="text-[12px] font-bold uppercase tracking-wider text-[#3d2e05]">
                    ★ キャンペーン価格 ★
                  </span>
                  <div className="my-1 border-b border-[#3d2e05]/20 pb-1 text-center">
                    <p className="text-[11px] font-semibold text-[#4e3a07]">ジェル大増量 6本入り</p>
                    <p className="text-[11px] text-[#4e3a07]">トレー上下＋専用ケース</p>
                  </div>
                  <div className="flex items-baseline justify-center">
                    <span className="text-[20px] font-bold">¥</span>
                    <span className="text-[44px] font-black tracking-tighter">28,000</span>
                  </div>
                  <span className="text-[12px] font-bold text-[#3d2e05]">（税込）</span>
                </div>

                {/* 通常版との対比 */}
                <div className="rounded-2xl border border-dashed border-[#e0cfbe] bg-white p-4">
                  <div className="flex items-center justify-between text-[12px] text-slate-500">
                    <span>通常価格（ジェル4本＋トレー）</span>
                    <span className="line-through">¥33,000 (税込)</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between font-bold text-[#0f3d4a]">
                    <span className="flex items-center gap-1 text-[13px]">
                      <Plus className="h-3.5 w-3.5 text-amber-500" />
                      ジェル2本増量（計6本）
                    </span>
                    <span className="text-[14px] text-rose-500">実質 ¥5,000 以上お得!</span>
                  </div>
                </div>

                <div className="mt-5 text-center text-[11px] text-slate-500">
                  ※写真は治療キットのイメージです。個人の歯型に合わせた専用トレーを作製します。
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 不安・疑問セクション */}
      <section className="bg-white py-16 md:py-24">
        <div className="mx-auto max-w-[1160px] px-4 md:px-6">
          <div className="mx-auto max-w-3xl text-center">
            <span className="text-[11px] font-bold uppercase tracking-[0.25em] text-[#8b6b4a]">
              Anxieties & Questions
            </span>
            <h2 className="mt-2 font-serif-jp text-[28px] font-medium leading-[1.3] text-[#0f3d4a] md:text-[38px]">
              ホワイトニングに興味はあるけれど、
              <br />
              こんな不安はありませんか？
            </h2>
            <p className="mt-4 text-[14px] text-slate-500 md:text-[15px]">
              多くの方が最初に感じやすい疑問や不安。三谷ファミリー歯科クリニックでは、
              治療を開始する前にしっかりと丁寧にご説明いたします。
            </p>
          </div>

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {worryItems.map(({ title, desc, icon: Icon }) => (
              <div
                key={title}
                className="group relative overflow-hidden rounded-2xl border border-slate-100 bg-[#fdfcfb] p-6 transition-all duration-300 hover:-translate-y-1 hover:border-[#ebdccb] hover:bg-white hover:shadow-[0_15px_35px_rgba(139,107,74,0.06)]"
              >
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#f4ece3] text-[#8b6b4a] transition-all group-hover:bg-[#0f3d4a] group-hover:text-white">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-5 font-serif-jp text-[18px] font-bold text-[#0f3d4a]">
                  {title}
                </h3>
                <p className="mt-2 text-[13px] leading-relaxed text-slate-600">
                  {desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* お悩みと歯科医院での相談セクション */}
      <section className="bg-gradient-to-b from-[#faf8f4] to-[#fdfcf9] py-16 md:py-24">
        <div className="mx-auto max-w-[1160px] px-4 md:px-6">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-start">
            {/* 左側：自己判断の不安 */}
            <div className="space-y-6 md:space-y-8">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-[0.25em] text-rose-500">
                  Risks of Self-Treatment
                </span>
                <h2 className="mt-2 font-serif-jp text-[26px] font-medium text-[#0f3d4a] md:text-[34px]">
                  自己流でのホワイトニングは
                  <br />
                  トラブルの元になることも
                </h2>
                <p className="mt-4 text-[14px] text-slate-600 md:text-[15px]">
                  市販されている製品や個人輸入の強い薬剤を使って、自己判断で行うホワイトニングは注意が必要です。
                </p>
              </div>

              {/* 不安を象徴するイメージ画像 */}
              <div className="relative h-48 w-full overflow-hidden rounded-2xl border border-rose-100 shadow-sm md:h-56">
                <Image
                  src="/images/library/cavity/cavity-3291061.jpg"
                  alt="自己判断によるホワイトニングで知覚過敏や痛みなどのトラブルに悩む女性のイメージ"
                  fill
                  className="object-cover object-center"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-900/40 via-transparent to-transparent" />
                <span className="absolute bottom-3 left-4 text-[11px] font-bold text-white tracking-wider">
                  ※強い薬剤による知覚過敏や歯肉炎のリスク
                </span>
              </div>

              <div className="space-y-4">
                {concernItems.map((item, index) => (
                  <div
                    key={item.title}
                    className="rounded-2xl border border-rose-100 bg-white p-5 shadow-[0_4px_12px_rgba(239,68,68,0.02)]"
                  >
                    <div className="flex gap-3">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rose-50 text-[11px] font-bold text-rose-500">
                        {index + 1}
                      </span>
                      <div>
                        <h4 className="text-[15px] font-bold text-slate-800">{item.title}</h4>
                        <p className="mt-1.5 text-[13px] leading-relaxed text-slate-500">{item.body}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 右側：当院の強み */}
            <div className="rounded-[32px] border border-[#e5d5c4] bg-white p-6 shadow-[0_15px_40px_rgba(139,107,74,0.05)] md:p-8">
              <span className="text-[11px] font-bold uppercase tracking-[0.25em] text-[#8b6b4a]">
                Why Choose Us
              </span>
              <h2 className="mt-2 font-serif-jp text-[26px] font-medium text-[#0f3d4a] md:text-[34px]">
                歯科医院で相談しながら
                <br />
                進めるべき3つの理由
              </h2>
              <p className="mt-3 text-[14px] text-slate-500">
                お口全体の健康を見守る歯科医院だからこそ、安全で美しく、持続性のあるホワイトニングを提案できます。
              </p>

              {/* 歯科医院での安全な診察イメージ */}
              <div className="relative mt-5 h-48 w-full overflow-hidden rounded-2xl border border-slate-100 shadow-sm md:h-56">
                <Image
                  src="/images/library/preventive/preventive-33802476.jpg"
                  alt="歯科医師がレントゲン写真を用いてお口の状態を詳しく説明している様子"
                  fill
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-900/30 via-transparent to-transparent" />
                <span className="absolute bottom-3 left-4 text-[11px] font-bold text-white tracking-wider">
                  ※事前にお口全体の健康状態を詳しく診査します
                </span>
              </div>

              <div className="mt-8 space-y-6">
                {clinicReasons.map((reason, index) => (
                  <div key={reason.title} className="flex gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#0f3d4a] font-serif-jp text-[16px] font-bold text-white">
                      0{index + 1}
                    </div>
                    <div>
                      <h3 className="font-serif-jp text-[18px] font-bold text-[#0f3d4a] md:text-[20px]">
                        {reason.title}
                      </h3>
                      <p className="mt-2 text-[13px] leading-relaxed text-slate-600 md:text-[14px]">
                        {reason.body}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 料金詳細セクション */}
      <section id="price-details" className="bg-white py-16 md:py-24">
        <div className="mx-auto max-w-[1160px] px-4 md:px-6">
          <div className="mx-auto max-w-3xl text-center">
            <span className="text-[11px] font-bold uppercase tracking-[0.25em] text-[#8b6b4a]">
              Campaign & Normal Price
            </span>
            <h2 className="mt-2 font-serif-jp text-[28px] font-medium text-[#0f3d4a] md:text-[38px]">
              キャンペーン料金とセット内容
            </h2>
            <p className="mt-4 text-[14px] text-slate-500 md:text-[15px]">
              通常版とキャンペーン版の違いを明確に記載しています。追加料金などの不透明な項目はありません。
            </p>
          </div>

          {/* 料金比較カード */}
          <div className="mx-auto mt-12 max-w-[840px] overflow-hidden rounded-[32px] border border-[#e5d4bf] bg-white shadow-[0_20px_50px_rgba(139,107,74,0.06)]">
            <div className="grid gap-0 md:grid-cols-2">
              {/* 通常版 */}
              <div className="bg-[#faf9f6] p-8 md:border-r md:border-[#e5d4bf]/50">
                <div className="inline-block rounded-full bg-slate-200 px-3 py-1 text-[10px] font-bold text-slate-600">
                  通常セット
                </div>
                <h3 className="mt-4 font-serif-jp text-[20px] font-bold text-slate-800">
                  ホームホワイトニング
                  <br />
                  通常プラン
                </h3>
                <div className="my-6 border-y border-slate-200/60 py-4">
                  <p className="text-[12px] text-slate-500">お渡し内容</p>
                  <ul className="mt-2 space-y-1 text-[13px] font-semibold text-slate-600">
                    <li className="flex items-center gap-1.5">
                      <Check className="h-4 w-4 text-slate-400" />
                      ジェル4本入り
                    </li>
                    <li className="flex items-center gap-1.5">
                      <Check className="h-4 w-4 text-slate-400" />
                      専用トレー上下
                    </li>
                    <li className="flex items-center gap-1.5 text-slate-400 line-through">
                      専用保管ケース (別売¥220)
                    </li>
                  </ul>
                </div>
                <div>
                  <p className="text-[12px] text-slate-500 font-semibold">通常合計価格</p>
                  <p className="mt-1 text-[36px] font-bold tracking-tight text-slate-700">
                    33,000円
                    <span className="text-[14px] font-medium text-slate-500">（税込）</span>
                  </p>
                </div>
              </div>

              {/* キャンペーン特別版 */}
              <div className="relative bg-gradient-to-b from-[#fdfbf7] to-[#fffcf7] p-8">
                {/* おすすめリボン */}
                <div className="absolute right-4 top-4 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 px-3 py-1 text-[10px] font-bold tracking-wider text-white shadow-sm">
                  期間限定増量!
                </div>

                <div className="inline-block rounded-full bg-[#0f3d4a] px-3 py-1 text-[10px] font-bold text-white">
                  キャンペーン特別セット
                </div>
                <h3 className="mt-4 font-serif-jp text-[20px] font-bold text-[#0f3d4a]">
                  ホームホワイトニング
                  <br />
                  2026年キャンペーン
                </h3>

                {/* ケース無料プレゼントを視覚的に伝える画像 */}
                <div className="relative mt-4 h-32 w-full overflow-hidden rounded-xl border border-[#ebdccb]/40">
                  <Image
                    src="/images/library/preventive/preventive-34197345.jpg"
                    alt="専用保管ケースに収められたホワイトニングトレー（マウスピース）のイメージ"
                    fill
                    className="object-cover"
                  />
                </div>

                <div className="my-6 border-y border-amber-200/50 py-4">
                  <p className="text-[12px] text-[#8b6b4a]">お渡し内容</p>
                  <ul className="mt-2 space-y-1 text-[13px] font-bold text-[#0f3d4a]">
                    <li className="flex items-center gap-1.5">
                      <Check className="h-4 w-4 text-amber-500" />
                      ジェル大増量 6本入り <span className="text-rose-500 text-[11px]">(2本増量!)</span>
                    </li>
                    <li className="flex items-center gap-1.5">
                      <Check className="h-4 w-4 text-amber-500" />
                      専用トレー上下
                    </li>
                    <li className="flex items-center gap-1.5 text-amber-600">
                      <Check className="h-4 w-4 text-amber-500" />
                      専用保管ケース <span className="text-amber-500 text-[11px]">(無料プレゼント!)</span>
                    </li>
                  </ul>
                </div>
                <div>
                  <p className="text-[12px] font-semibold text-[#8b6b4a]">キャンペーン特別価格</p>
                  <p className="mt-1 text-[40px] font-black tracking-tight text-[#0f3d4a]">
                    28,000円
                    <span className="text-[16px] font-medium text-slate-500">（税込）</span>
                  </p>
                </div>
              </div>
            </div>
            
            {/* キャンペーンの下部バナー */}
            <div className="bg-[#0f3d4a] px-6 py-4 text-center text-white">
              <p className="text-[13px] font-semibold tracking-wider">
                【キャンペーン対象期間】2026年6月1日（月）〜2026年9月30日（水）のお申し込み分まで
              </p>
            </div>
          </div>

          {/* 特徴3つの再整理 */}
          <div className="mx-auto mt-12 grid max-w-[960px] gap-6 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-100 bg-[#fdfcf9] p-6 text-center">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-amber-50 text-amber-600">
                <Check className="h-5 w-5" />
              </div>
              <h4 className="mt-4 font-serif-jp text-[16px] font-bold text-[#0f3d4a]">ジェルがたっぷり6本</h4>
              <p className="mt-2 text-[12px] leading-relaxed text-slate-500">
                通常より2本増量しているため、白さを長く維持するための追加メンテナンス用としても十分に使えます。
              </p>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-[#fdfcf9] p-6 text-center">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-amber-50 text-amber-600">
                <Check className="h-5 w-5" />
              </div>
              <h4 className="mt-4 font-serif-jp text-[16px] font-bold text-[#0f3d4a]">自分専用トレー作製</h4>
              <p className="mt-2 text-[12px] leading-relaxed text-slate-500">
                歯科医院だからできるオーダーメイドの精密な歯型取りを行い、薬剤漏れを防ぐ完璧なトレーを作ります。
              </p>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-[#fdfcf9] p-6 text-center">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-amber-50 text-amber-600">
                <Check className="h-5 w-5" />
              </div>
              <h4 className="mt-4 font-serif-jp text-[16px] font-bold text-[#0f3d4a]">安心のアフターフォロー</h4>
              <p className="mt-2 text-[12px] leading-relaxed text-slate-500">
                施術中にお口のトラブルが発生したり、しみる症状が出た場合でも、当院でいつでもケアを受けられます。
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* おすすめする対象 */}
      <section className="bg-gradient-to-b from-[#fdfcf9] to-[#faf8f4] py-16 md:py-24">
        <div className="mx-auto max-w-[1160px] px-4 md:px-6">
          <div className="mx-auto max-w-3xl text-center">
            <span className="text-[11px] font-bold uppercase tracking-[0.25em] text-[#8b6b4a]">
              Recommended For You
            </span>
            <h2 className="mt-2 font-serif-jp text-[28px] font-medium text-[#0f3d4a] md:text-[38px]">
              こんな方におすすめのキャンペーンです
            </h2>
            <p className="mt-4 text-[14px] text-slate-500 md:text-[15px]">
              急激な漂白ではなく、歯の健康を維持しながら、自然で美しい透明感のある白さを目指したい方に最適です。
            </p>
          </div>

          <div className="mx-auto mt-12 max-w-[800px] grid gap-4 sm:grid-cols-2">
            <div className="flex gap-3 rounded-2xl border border-[#ebdccb]/60 bg-white p-5 shadow-sm">
              <Check className="h-5 w-5 shrink-0 text-[#8b6b4a]" />
              <span className="text-[14px] font-bold text-slate-700">タバコのヤニやコーヒー等の着色・黄ばみが気になる</span>
            </div>
            <div className="flex gap-3 rounded-2xl border border-[#ebdccb]/60 bg-white p-5 shadow-sm">
              <Check className="h-5 w-5 shrink-0 text-[#8b6b4a]" />
              <span className="text-[14px] font-bold text-slate-700">サロンのセルフホワイトニングでは効果を実感できなかった</span>
            </div>
            <div className="flex gap-3 rounded-2xl border border-[#ebdccb]/60 bg-white p-5 shadow-sm">
              <Check className="h-5 w-5 shrink-0 text-[#8b6b4a]" />
              <span className="text-[14px] font-bold text-slate-700">イベントや就職活動、挙式前に口元の印象を良くしたい</span>
            </div>
            <div className="flex gap-3 rounded-2xl border border-[#ebdccb]/60 bg-white p-5 shadow-sm">
              <Check className="h-5 w-5 shrink-0 text-[#8b6b4a]" />
              <span className="text-[14px] font-bold text-slate-700">通院回数を抑えて、自宅で自分の好きな時間にケアしたい</span>
            </div>
            <div className="flex gap-3 rounded-2xl border border-[#ebdccb]/60 bg-white p-5 shadow-sm sm:col-span-2">
              <Check className="h-5 w-5 shrink-0 text-[#8b6b4a]" />
              <span className="text-[14px] font-bold text-slate-700">お口の健康状態（むし歯や歯周病）もしっかり専門医に診てもらいながら安心してホワイトニングしたい</span>
            </div>
          </div>
        </div>
      </section>

      {/* ご相談から開始までの流れ（タイムライン） */}
      <section className="bg-white py-16 md:py-24">
        <div className="mx-auto max-w-[1160px] px-4 md:px-6">
          <div className="mx-auto max-w-3xl text-center">
            <span className="text-[11px] font-bold uppercase tracking-[0.25em] text-[#8b6b4a]">
              Treatment Flow
            </span>
            <h2 className="mt-2 font-serif-jp text-[28px] font-medium text-[#0f3d4a] md:text-[38px]">
              ご相談からホワイトニング開始までの流れ
            </h2>
            <p className="mt-4 text-[14px] text-slate-500 md:text-[15px]">
              型取りからキットのお渡しまで、簡単5ステップでスムーズに進められます。
            </p>
          </div>

          {/* タイムライン */}
          <div className="mx-auto mt-16 max-w-[800px] relative">
            {/* 縦のタイムライン中心線（デスクトップのみ） */}
            <div className="absolute left-[30px] top-4 bottom-4 w-0.5 bg-[#e5d4bf]/50 sm:left-1/2 sm:-translate-x-1/2" />

            <div className="space-y-12">
              {flowSteps.map((step, index) => (
                <div
                  key={step.step}
                  className={`relative flex flex-col gap-6 sm:flex-row sm:items-center ${
                    index % 2 === 1 ? 'sm:flex-row-reverse' : ''
                  }`}
                >
                  {/* マーカーサークル */}
                  <div className="absolute left-0 top-0 z-10 flex h-[62px] w-[62px] items-center justify-center rounded-full border-4 border-white bg-gradient-to-br from-[#f5e3be] via-[#d4af37] to-[#aa8314] text-white shadow-md sm:left-1/2 sm:-translate-x-1/2">
                    <span className="text-[14px] font-bold">Step</span>
                  </div>

                  {/* カード部分 */}
                  <div className="w-full pl-20 sm:w-[calc(50%-40px)] sm:pl-0">
                    <div className="rounded-2xl border border-[#ebdccb]/60 bg-gradient-to-br from-white to-[#fbfaf8] p-6 shadow-sm">
                      {/* ステップのイメージ画像 */}
                      {step.image && (
                        <div className="relative mb-4 h-36 w-full overflow-hidden rounded-xl border border-slate-100">
                          <Image
                            src={step.image}
                            alt={`${step.title}の様子`}
                            fill
                            className="object-cover"
                          />
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <span className="text-[20px] font-bold text-[#8b6b4a] font-serif-jp">{step.step}</span>
                        <h3 className="font-serif-jp text-[18px] font-bold text-[#0f3d4a]">
                          {step.title}
                        </h3>
                      </div>
                      <p className="mt-3 text-[13px] leading-relaxed text-slate-600">
                        {step.body}
                      </p>
                    </div>
                  </div>

                  {/* 空白バッファ（デスクトップの左右振り分け用） */}
                  <div className="hidden sm:block sm:w-[calc(50%-40px)]" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 注意事項 ＆ FAQ */}
      <section className="bg-gradient-to-b from-[#faf8f4] to-[#fdfcf9] py-16 md:py-24">
        <div className="mx-auto max-w-[1160px] px-4 md:px-6">
          <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr]">
            {/* 注意事項カード */}
            <div className="rounded-[32px] border border-[#e5d4bf] bg-white p-6 shadow-sm md:p-8">
              <span className="text-[11px] font-bold uppercase tracking-[0.25em] text-[#8b6b4a]">
                Precautions
              </span>
              <h2 className="mt-2 font-serif-jp text-[24px] font-medium text-[#0f3d4a] md:text-[30px]">
                お申し込み前の注意事項
              </h2>
              <p className="mt-3 text-[13px] text-slate-500 leading-relaxed">
                医療ホワイトニングを安全かつ効果的に体験いただくため、以下の内容をあらかじめご確認ください。
              </p>
              
              <ul className="mt-6 space-y-4">
                {cautions.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-[13px] leading-relaxed text-slate-600">
                    <ShieldCheck className="mt-0.5 h-4.5 w-4.5 shrink-0 text-[#8b6b4a]" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* FAQアコーディオン (HTML details) */}
            <div className="space-y-4">
              <div className="mb-6">
                <span className="text-[11px] font-bold uppercase tracking-[0.25em] text-[#8b6b4a]">
                  Frequently Asked Questions
                </span>
                <h2 className="mt-2 font-serif-jp text-[24px] font-medium text-[#0f3d4a] md:text-[30px]">
                  よくある質問
                </h2>
              </div>

              <div className="space-y-3">
                {faqs.map((faq) => (
                  <details
                    key={faq.question}
                    className="group rounded-2xl border border-slate-100 bg-white p-5 shadow-[0_2px_8px_rgba(0,0,0,0.01)] [&_summary::-webkit-details-marker]:hidden"
                  >
                    <summary className="flex cursor-pointer items-center justify-between gap-1.5 text-slate-900 focus:outline-none">
                      <div className="flex gap-2">
                        <CircleHelp className="h-5 w-5 shrink-0 text-[#8b6b4a]" />
                        <h3 className="font-serif-jp text-[15px] font-bold text-[#0f3d4a] md:text-[16px]">
                          {faq.question}
                        </h3>
                      </div>
                      <span className="shrink-0 rounded-full bg-slate-50 p-1 text-slate-500 transition duration-300 group-open:-rotate-180">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-4 w-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                        </svg>
                      </span>
                    </summary>
                    <p className="mt-4 border-l-2 border-amber-200 pl-4 text-[13px] leading-relaxed text-slate-600 md:text-[14px]">
                      {faq.answer}
                    </p>
                  </details>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ファイナルCTA */}
      <section className="bg-white py-16 md:py-24">
        <div className="mx-auto max-w-[1160px] px-4 md:px-6">
          <div className="rounded-[40px] border border-[#e5d4bf] bg-gradient-to-br from-[#f7f2ea] via-[#fdfcf9] to-[#ffffff] px-6 py-12 shadow-[0_30px_60px_rgba(139,107,74,0.08)] md:px-12 md:py-16">
            <div className="flex flex-col gap-8 lg:grid lg:grid-cols-[1fr_380px] lg:items-center">
              
              {/* コピーとイメージの組み合わせ */}
              <div className="grid gap-6 md:grid-cols-[160px_1fr] md:items-center lg:grid-cols-[180px_1fr]">
                {/* 美しい笑顔のイメージ画像 */}
                <div className="relative mx-auto h-40 w-40 overflow-hidden rounded-full border-4 border-white shadow-md md:h-40 md:w-40 lg:h-44 lg:w-44 shrink-0">
                  <Image
                    src="/images/library/preventive/preventive-34660571.jpg"
                    alt="ホームホワイトニングで白い歯を手に入れた女性の笑顔"
                    fill
                    className="object-cover"
                  />
                </div>

                <div className="space-y-4 text-center md:text-left">
                  <span className="text-[11px] font-bold uppercase tracking-[0.25em] text-[#8b6b4a]">
                    Contact us & Start whitening
                  </span>
                  <h2 className="font-serif-jp text-[28px] font-medium leading-[1.3] text-[#0f3d4a] md:text-[32px] lg:text-[36px]">
                    歯を白くきれいに整え、
                    <br />
                    笑顔に自信をプラスしませんか？
                  </h2>
                  <p className="text-[14px] leading-relaxed text-slate-600">
                    三谷ファミリー歯科クリニックでは、ホワイトニングのお悩み・ご相談だけでも承っております。
                    お気軽にお問い合わせ、またはスタッフへお声がけください。
                  </p>
                </div>
              </div>

              {/* キャンペーンサマリーボックス */}
              <div className="w-full max-w-[380px] rounded-3xl border border-white bg-white/90 p-6 shadow-md backdrop-blur-sm lg:shrink-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#8b6b4a]">
                  CAMPAIGN SUMMARY
                </p>
                <h3 className="mt-1 font-serif-jp text-[18px] font-bold text-[#0f3d4a]">
                  ホームホワイトニングキャンペーン
                </h3>
                
                <div className="my-4 border-y border-[#ebdccb]/60 py-3 space-y-1">
                  <div className="flex justify-between text-[12px] text-slate-500">
                    <span>通常価格</span>
                    <span className="line-through">¥33,000 (税込)</span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-[11px] font-bold text-rose-500">キャンペーン価格</span>
                    <span className="text-[28px] font-black text-[#0f3d4a]">
                      28,000<span className="text-[14px] font-medium">円 (税込)</span>
                    </span>
                  </div>
                </div>

                <p className="text-[11px] leading-relaxed text-slate-500">
                  期間：2026年6月1日(月) 〜 9月30日(水)
                  <br />
                  内容：ジェル6本 / 専用トレー上下 / 保管ケース
                </p>

                <Link
                  href={ctaHref}
                  className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#0f3d4a] px-6 py-3 text-[14px] font-bold text-white shadow-md transition-all hover:bg-[#1a5566]"
                >
                  予約・お問い合わせをする
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* モバイル用固定CTAバー */}
      <div className="fixed bottom-0 inset-x-0 bg-white/90 backdrop-blur-md border-t border-slate-100 p-4 flex items-center justify-between z-40 md:hidden shadow-[0_-5px_15px_rgba(0,0,0,0.03)]">
        <div>
          <p className="text-[10px] font-bold text-rose-500">期間限定キャンペーン</p>
          <p className="text-[18px] font-black text-[#0f3d4a]">
            28,000<span className="text-[11px] font-medium text-slate-500">円（税込）</span>
          </p>
        </div>
        <Link
          href={ctaHref}
          className="inline-flex h-11 items-center justify-center gap-1.5 rounded-full bg-[#0f3d4a] px-5 text-[13px] font-bold text-white shadow-sm hover:bg-[#1a5566]"
        >
          予約・相談
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      {/* フッターがモバイル固定CTAバーと重ならないための余白 */}
      <div className="h-20 md:hidden" />
    </div>
  )
}
