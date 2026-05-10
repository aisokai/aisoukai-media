# デザイン刷新・表記修正 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 「愛走会」誤表記を「藍想会」に全修正し、トップ・一覧・詳細・コンポーネント全体を医療×AI×清潔感のある navy/blue ベースデザインへ全面刷新する。

**Architecture:** Tailwind CSS v4 ユーティリティクラス直書き。コンポーネント単位で commit して差分を小さく保つ。src/lib/posts.ts・content/posts/ の Markdown は**変更しない**（ダミー記事末尾の表記修正のみ）。

**Tech Stack:** Next.js 15 (App Router), TypeScript strict, Tailwind CSS v4, gray-matter, remark/remark-html

---

## 変更ファイル一覧

| ファイル | 変更種別 |
|----------|----------|
| `src/app/globals.css` | 全面置換（prose typography 刷新） |
| `src/app/layout.tsx` | 全面置換（metadata「愛走会」→「藍想会」修正） |
| `src/app/page.tsx` | 全面置換（hero/categories/recent posts） |
| `src/app/blog/page.tsx` | 全面置換（ページヘッダー・グリッドレイアウト） |
| `src/app/blog/[slug]/page.tsx` | 全面置換（読みやすいレイアウト・prose） |
| `src/components/Header.tsx` | 全面置換（表記修正・リデザイン） |
| `src/components/Footer.tsx` | 全面置換（表記修正・リデザイン） |
| `src/components/ArticleCard.tsx` | 全面置換（バッジ・カード・タイポグラフィ刷新） |
| `content/posts/2026-01-15-ai-dental-diagnosis.md` | 末尾の「愛走会」→「藍想会」修正 |
| `README.md` | 「愛走会」→「藍想会」修正 |

**修正しないファイル:** `src/lib/posts.ts`, `package.json`, `tsconfig.json`

---

## Task 1: 表記一括修正「愛走会」→「藍想会」

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `content/posts/2026-01-15-ai-dental-diagnosis.md`
- Modify: `README.md`

- [ ] **Step 1: 修正対象を確認**

```bash
cd ~/Desktop/aisoukai-media
grep -rn "愛走会" src/ content/ README.md
```

Expected:
```
src/app/layout.tsx:    default: '愛走会メディア | ...
src/app/layout.tsx:    template: '%s | 愛走会メディア',
src/components/Footer.tsx:        <p>© {year} 愛走会メディア. ...
src/components/Header.tsx:            愛走会メディア
content/posts/2026-01-15-ai-dental-diagnosis.md:愛走会では、...
README.md:愛走会が運営する...
```

（Header.tsx / Footer.tsx は後続タスクで対処するためここでは修正しない。）

- [ ] **Step 2: layout.tsx を全置換**

`src/app/layout.tsx` の内容を以下に置き換える（既存内容を全削除）:

```tsx
import type { Metadata } from 'next';
import './globals.css';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

export const metadata: Metadata = {
  title: {
    default: '藍想会メディア | 歯科医療をわかりやすく',
    template: '%s | 藍想会メディア',
  },
  description:
    'お口の健康、予防、訪問歯科、医院からのお知らせを、わかりやすくお届けする歯科医療メディアです。',
  metadataBase: new URL('https://media.aisoukai.jp'),
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="min-h-screen flex flex-col bg-white text-gray-800">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
```

- [ ] **Step 3: ダミー記事末尾の表記修正**

`content/posts/2026-01-15-ai-dental-diagnosis.md` の最終行:

修正前: `愛走会では、最新のAI技術動向を継続的にお届けし、歯科医療の未来を一緒に考えていきます。`

修正後: `藍想会では、最新のAI技術動向を継続的にお届けし、歯科医療の未来を一緒に考えていきます。`

- [ ] **Step 4: README の表記修正**

`README.md` の2行目:

修正前: `愛走会が運営する歯科メディアサイト。...`

修正後: `藍想会が運営する歯科メディアサイト。...`

- [ ] **Step 5: 確認と commit**

```bash
cd ~/Desktop/aisoukai-media
grep -n "愛走会" src/app/layout.tsx content/posts/2026-01-15-ai-dental-diagnosis.md README.md && echo "残存あり！" || echo "修正済み ✅"
npx tsc --noEmit 2>&1 | head -5
git add src/app/layout.tsx content/posts/2026-01-15-ai-dental-diagnosis.md README.md
git commit -m "fix: correct name from 愛走会 to 藍想会 in layout/content/README"
```

---

## Task 2: globals.css デザイン基盤刷新

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: globals.css を全置換**

`src/app/globals.css` の内容を以下に置き換える:

```css
@import "tailwindcss";

@layer base {
  html {
    font-family: 'Hiragino Kaku Gothic ProN', 'Hiragino Sans', 'Noto Sans JP',
      'Meiryo', sans-serif;
    -webkit-font-smoothing: antialiased;
  }

  body {
    @apply bg-white text-gray-800;
  }
}

@layer utilities {
  /* 記事本文 typography — 医療メディアの読みやすさを優先 */
  .prose {
    @apply text-gray-700 leading-loose;
  }

  .prose h2 {
    @apply text-xl font-bold text-gray-900 mt-12 mb-5 pl-4;
    border-left: 4px solid #2563eb;
  }

  .prose h3 {
    @apply text-lg font-semibold text-gray-800 mt-8 mb-3;
  }

  .prose p {
    @apply mb-6 leading-loose;
  }

  .prose ul {
    @apply pl-6 mb-6 space-y-2;
    list-style-type: disc;
  }

  .prose ol {
    @apply pl-6 mb-6 space-y-2;
    list-style-type: decimal;
  }

  .prose li {
    @apply leading-relaxed text-gray-700;
  }

  .prose strong {
    @apply font-bold text-gray-900;
  }

  .prose a {
    @apply text-blue-600 underline underline-offset-2 hover:text-blue-800 transition-colors;
  }
}
```

- [ ] **Step 2: commit**

```bash
cd ~/Desktop/aisoukai-media
git add src/app/globals.css
git commit -m "style: redesign globals.css with blue prose typography base"
```

---

## Task 3: Header リデザイン

**Files:**
- Modify: `src/components/Header.tsx`

- [ ] **Step 1: Header.tsx を全置換**

`src/components/Header.tsx` の内容を以下に置き換える:

```tsx
import Link from 'next/link';

export default function Header() {
  return (
    <header className="bg-white border-b border-gray-200">
      <div className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between">
        <Link href="/" className="group flex flex-col gap-0.5">
          <span className="text-xl font-bold text-gray-900 tracking-tight leading-none group-hover:text-blue-700 transition-colors">
            藍想会メディア
          </span>
          <span className="text-xs text-gray-400 tracking-wide">
            歯科医療をわかりやすく
          </span>
        </Link>
        <nav aria-label="メインナビゲーション" className="flex items-center gap-8 text-sm text-gray-600">
          <Link href="/" className="hover:text-blue-700 transition-colors">
            ホーム
          </Link>
          <Link href="/blog" className="hover:text-blue-700 transition-colors">
            記事一覧
          </Link>
        </nav>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: 型チェックと commit**

```bash
cd ~/Desktop/aisoukai-media
npx tsc --noEmit 2>&1 | head -5
git add src/components/Header.tsx
git commit -m "style: redesign Header with navy/blue scheme and corrected name 藍想会"
```

---

## Task 4: Footer リデザイン

**Files:**
- Modify: `src/components/Footer.tsx`

- [ ] **Step 1: Footer.tsx を全置換**

`src/components/Footer.tsx` の内容を以下に置き換える:

```tsx
import Link from 'next/link';

export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="bg-gray-50 border-t border-gray-200 mt-auto">
      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="flex flex-col sm:flex-row justify-between gap-8 mb-10">
          <div>
            <p className="text-base font-bold text-gray-900 mb-2">藍想会メディア</p>
            <p className="text-sm text-gray-500 leading-relaxed max-w-xs">
              お口の健康、予防、訪問歯科、医院からのお知らせを
              <br className="hidden sm:block" />
              わかりやすくお届けします。
            </p>
          </div>
          <nav aria-label="フッターナビゲーション" className="flex flex-col gap-2 text-sm text-gray-500">
            <Link href="/" className="hover:text-blue-700 transition-colors">ホーム</Link>
            <Link href="/blog" className="hover:text-blue-700 transition-colors">記事一覧</Link>
          </nav>
        </div>
        <div className="pt-6 border-t border-gray-200 text-center text-xs text-gray-400">
          <p>© {year} 藍想会メディア. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
```

- [ ] **Step 2: 型チェックと commit**

```bash
cd ~/Desktop/aisoukai-media
npx tsc --noEmit 2>&1 | head -5
git add src/components/Footer.tsx
git commit -m "style: redesign Footer with two-column layout and corrected name 藍想会"
```

---

## Task 5: ArticleCard リデザイン

**Files:**
- Modify: `src/components/ArticleCard.tsx`

- [ ] **Step 1: ArticleCard.tsx を全置換**

`src/components/ArticleCard.tsx` の内容を以下に置き換える:

```tsx
import Link from 'next/link';
import type { PostMeta } from '@/lib/posts';

type Props = {
  post: PostMeta;
};

export default function ArticleCard({ post }: Props) {
  const formattedDate = new Date(post.date).toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <article className="group bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md hover:border-blue-200 transition-all duration-200">
      <Link href={`/blog/${post.slug}`} className="block p-6">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-xs font-medium text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full">
            {post.category}
          </span>
          <time className="text-xs text-gray-400">{formattedDate}</time>
        </div>
        <h2 className="text-base font-semibold text-gray-900 leading-snug group-hover:text-blue-700 transition-colors mb-3">
          {post.title}
        </h2>
        <p className="text-sm text-gray-500 leading-relaxed line-clamp-2 mb-5">
          {post.description}
        </p>
        <div className="flex items-end justify-between gap-4">
          <div className="flex flex-wrap gap-1.5">
            {post.tags.map((tag) => (
              <span
                key={tag}
                className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded"
              >
                #{tag}
              </span>
            ))}
          </div>
          <span className="shrink-0 text-xs text-blue-600 font-medium group-hover:translate-x-0.5 transition-transform inline-block">
            読む →
          </span>
        </div>
      </Link>
    </article>
  );
}
```

- [ ] **Step 2: 型チェックと commit**

```bash
cd ~/Desktop/aisoukai-media
npx tsc --noEmit 2>&1 | head -5
git add src/components/ArticleCard.tsx
git commit -m "style: redesign ArticleCard with blue badge, shadow card, read CTA"
```

---

## Task 6: トップページ全面刷新

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: page.tsx を全置換**

`src/app/page.tsx` の内容を以下に置き換える:

```tsx
import Link from 'next/link';
import { getAllPosts } from '@/lib/posts';
import ArticleCard from '@/components/ArticleCard';

const CATEGORIES = [
  { name: '予防歯科', desc: 'むし歯・歯周病の予防と定期ケア' },
  { name: '訪問歯科', desc: 'ご自宅・施設での歯科治療' },
  { name: '小児歯科', desc: 'お子さまの口腔発育とケア' },
  { name: '医院からのお知らせ', desc: '休診日・新しい取り組み' },
] as const;

export default function HomePage() {
  const recentPosts = getAllPosts().slice(0, 3);

  return (
    <div>
      {/* Hero */}
      <section className="bg-gradient-to-b from-blue-50 to-white">
        <div className="max-w-5xl mx-auto px-6 py-20 sm:py-28">
          <p className="text-xs font-semibold tracking-[0.2em] text-blue-600 uppercase mb-5">
            Dental Media
          </p>
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 leading-tight tracking-tight mb-5">
            藍想会メディア
          </h1>
          <p className="text-xl sm:text-2xl font-medium text-gray-600 mb-4">
            歯科医療を、もっとわかりやすく。
          </p>
          <p className="text-base text-gray-500 leading-relaxed max-w-lg mb-10">
            お口の健康、予防、訪問歯科、医院からのお知らせを、わかりやすくお届けします。
          </p>
          <Link
            href="/blog"
            className="inline-flex items-center gap-2 bg-blue-700 text-white text-sm font-semibold px-6 py-3 rounded-lg hover:bg-blue-800 transition-colors"
          >
            記事を読む
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>

      {/* Categories */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <h2 className="text-lg font-semibold text-gray-900 mb-6">カテゴリから探す</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {CATEGORIES.map((cat) => (
            <div
              key={cat.name}
              className="bg-white border border-gray-200 rounded-xl p-5 hover:border-blue-300 hover:shadow-sm transition-all"
            >
              <p className="text-sm font-semibold text-gray-900 mb-1">{cat.name}</p>
              <p className="text-xs text-gray-400 leading-relaxed">{cat.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Recent posts */}
      {recentPosts.length > 0 && (
        <section className="max-w-5xl mx-auto px-6 pb-24">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-900">最新記事</h2>
            <Link
              href="/blog"
              className="text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors"
            >
              すべて見る →
            </Link>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {recentPosts.map((post) => (
              <ArticleCard key={post.slug} post={post} />
            ))}
          </div>
        </section>
      )}

      {recentPosts.length === 0 && (
        <section className="max-w-5xl mx-auto px-6 pb-24 text-center py-16 text-gray-400">
          <p>記事を準備中です。しばらくお待ちください。</p>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 型チェックと commit**

```bash
cd ~/Desktop/aisoukai-media
npx tsc --noEmit 2>&1 | head -5
git add src/app/page.tsx
git commit -m "style: redesign top page with hero gradient, category grid, recent posts"
```

---

## Task 7: ブログ一覧ページ刷新

**Files:**
- Modify: `src/app/blog/page.tsx`

- [ ] **Step 1: blog/page.tsx を全置換**

`src/app/blog/page.tsx` の内容を以下に置き換える:

```tsx
import type { Metadata } from 'next';
import { getAllPosts } from '@/lib/posts';
import ArticleCard from '@/components/ArticleCard';

export const metadata: Metadata = {
  title: '記事一覧',
  description: '歯科医療・予防・訪問歯科・医院情報に関する最新記事の一覧です。',
};

export default function BlogPage() {
  const posts = getAllPosts();

  return (
    <div className="max-w-5xl mx-auto px-6 py-14">
      <header className="mb-12">
        <p className="text-xs font-semibold tracking-[0.15em] text-blue-600 uppercase mb-2">
          Articles
        </p>
        <h1 className="text-3xl font-bold text-gray-900">記事一覧</h1>
        <p className="text-sm text-gray-400 mt-2">{posts.length}件の記事</p>
      </header>

      {posts.length > 0 ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {posts.map((post) => (
            <ArticleCard key={post.slug} post={post} />
          ))}
        </div>
      ) : (
        <div className="text-center py-24 text-gray-400">
          <p>記事を準備中です。しばらくお待ちください。</p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 型チェックと commit**

```bash
cd ~/Desktop/aisoukai-media
npx tsc --noEmit 2>&1 | head -5
git add src/app/blog/page.tsx
git commit -m "style: redesign blog list page with eyebrow label and grid layout"
```

---

## Task 8: 記事詳細ページ刷新

**Files:**
- Modify: `src/app/blog/[slug]/page.tsx`

記事詳細ページの本文レンダリングには既存の実装（remark-html sanitize:true 処理済みHTML + eslint-disable コメント）をそのまま踏襲すること。

- [ ] **Step 1: blog/[slug]/page.tsx を全置換**

`src/app/blog/[slug]/page.tsx` を以下の構造で実装する:

- `type Props = { params: Promise<{ slug: string }> }`
- `generateStaticParams()`: getAllPosts() から slug 配列を返す
- `generateMetadata()`: title と description を返す
- `ArticlePage()`: notFound() ガード、パンくず（aria-label="パンくずリスト"）、記事ヘッダー（category badge blue-700/blue-50、date、h1、description 左ボーダー、tags）、hr セパレータ、prose div（既存の sanitize 済み innerHTML 実装）、hr セパレータ、「← 記事一覧に戻る」リンク

デザイン仕様:
- 外側コンテナ: `max-w-5xl mx-auto px-6 py-12`
- 本文コンテナ: `max-w-2xl` （読みやすい幅）
- パンくず: `text-xs text-gray-400`、ホーム/記事一覧/タイトル（各 hover:text-blue-600）
- カテゴリバッジ: `text-xs font-medium text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full`
- h1: `text-2xl sm:text-3xl font-bold text-gray-900 leading-tight`
- description: `text-gray-500 leading-relaxed border-l-2 border-blue-200 pl-4`
- tags: `text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded`
- 戻るリンク: `text-sm text-blue-600 hover:text-blue-800 font-medium`

本文部分の実装（セキュリティ済みHTML挿入）はファイルを bash heredoc 等で書き込み、既存の eslint-disable コメントと sanitize コメントを維持すること。

完成したファイルの内容を確認:

```bash
cd ~/Desktop/aisoukai-media
grep -n "max-w-2xl\|breadcrumb\|パンくず\|blue-700\|blue-50\|rounded-full" "src/app/blog/[slug]/page.tsx" | head -15
```

- [ ] **Step 2: 型チェックと commit**

```bash
cd ~/Desktop/aisoukai-media
npx tsc --noEmit 2>&1 | head -10
git add "src/app/blog/[slug]/page.tsx"
git commit -m "style: redesign article detail page with max-w-2xl prose, blue accents"
```

---

## Task 9: 動作確認

- [ ] **Step 1: 型チェック**

```bash
cd ~/Desktop/aisoukai-media
npx tsc --noEmit 2>&1
```

Expected: 出力なし（エラーゼロ）。

- [ ] **Step 2: 本番ビルド**

```bash
cd ~/Desktop/aisoukai-media
npm run build 2>&1 | tail -20
```

Expected: エラーなし、3ルート（/ /blog /blog/[slug]）が表示される。

- [ ] **Step 3: 表記最終確認**

```bash
cd ~/Desktop/aisoukai-media
echo "=== 藍想会（正しい表記） ==="
grep -rn "藍想会" src/ content/ README.md
echo ""
echo "=== 愛走会（残存していれば修正必要） ==="
grep -rn "愛走会" src/ content/ README.md && echo "残存あり！" || echo "残存なし ✅"
```

- [ ] **Step 4: dev サーバー確認**

```bash
cd ~/Desktop/aisoukai-media
npm run dev &
sleep 8
echo "TOP:"; curl -s -o /dev/null -w "%{http_code}" http://localhost:3000; echo
echo "BLOG:"; curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/blog; echo
echo "ARTICLE:"; curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/blog/2026-01-15-ai-dental-diagnosis; echo
pkill -f "next dev" 2>/dev/null || kill %1 2>/dev/null || true
```

Expected: 全て `200`。

---

## Self-Review

| 要件 | 対応タスク |
|------|----------|
| 「藍想会」表記統一（「愛走会」全廃） | Task 1 + Task 3 + Task 4 |
| 白基調・淡いブルー/ネイビー/グレー | Task 2〜8 全コンポーネント |
| 医療法人らしい清潔感 | Task 3 Header + Task 6 Hero |
| AIメディアらしい先進性 | Task 6 eyebrow "Dental Media" |
| ファーストビュー（タイトル/サブコピー/説明文） | Task 6 Hero section |
| 最新記事セクション | Task 6 |
| カテゴリ導線（予防歯科/訪問歯科/小児歯科/お知らせ） | Task 6 |
| 角丸・カード・余白 | Task 5 rounded-xl + Task 6 |
| スマホ対応（レスポンシブ） | 全タスク sm: / lg: ブレークポイント |
| 記事詳細・読みやすい本文幅 max-w-2xl | Task 8 |
| 記事詳細・見出しデザイン（h2 左ボーダー） | Task 2 globals.css prose |
| 記事詳細・日付・カテゴリ・タグ | Task 8 |
| 記事詳細・戻る導線 | Task 8 |
| CTAエリア（トップボタン） | Task 6 Hero |
| タグ・日付表示刷新 | Task 5 ArticleCard |
| CMS/DB/認証/大型UIライブラリなし | 全タスク追加ライブラリなし |
| 過剰なアニメーションなし | duration-200 + translate のみ |

型の一貫性:
- PostMeta 型は src/lib/posts.ts から変更なし ✓
- 全コンポーネントで型インポートは既存のまま ✓
