// URL スラグ → カテゴリ名のマスタ定義。
// category/[slug]/page.tsx と seo.ts が同じソースを参照することで二重管理を防ぐ。
export const CATEGORY_SLUG_MAP: Record<string, string> = {
  'cavity':       '虫歯治療',
  'root-canal':   '根管治療',
  'periodontal':  '歯周病治療',
  'preventive':   '予防歯科',
  'pediatric':    '小児歯科',
  'orthodontics': '矯正歯科',
  'wisdom-tooth': '親知らず',
  'implant':      'インプラント',
  'other':        'その他',
  'news':         'お知らせ',
}

// カテゴリ名 → URL スラグ（sitemap / SEO ヘルパー用）
export const CATEGORY_URL_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(CATEGORY_SLUG_MAP).map(([slug, name]) => [name, slug])
)
