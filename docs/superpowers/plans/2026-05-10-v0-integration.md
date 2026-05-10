# v0デザイン統合 実装プラン

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/tmp/dental-media-design/` にある v0 生成 UI コンポーネントを `~/Desktop/aisoukai-media` の Next.js プロジェクトに統合し、既存の Markdown 記事管理・ルーティング・データ取得構造を一切壊さずに UI 層のみを刷新する。

**Architecture:** Next.js 15 App Router + TypeScript strict + Tailwind v4 (`@import "tailwindcss"`) の既存構成を維持。shadcn/ui は使わず lucide-react + clsx + tailwind-merge のみ追加。記事データは `getAllPosts()` / `getPostBySlug()` 経由でのみ取得。外部画像（Unsplash 等）は一切使わず CSS グラデーションで代替。

**Tech Stack:** Next.js 15, TypeScript strict, Tailwind CSS v4, lucide-react, clsx, tailwind-merge, gray-matter, remark, remark-html

---

## 絶対ルール（全タスク共通）

- `src/lib/posts.ts` は **読み取り専用**。変更禁止。
- `content/posts/` は **変更禁止**。
- `src/app/blog/[slug]/page.tsx` の `generateStaticParams` と `generateMetadata` は必ず維持する。
- Next.js 15 のため params は `Promise<{ slug: string }>` — `const { slug } = await params` が必須。
- Tailwind は v4。`tailwind.config.ts` は存在しない。`@import "tailwindcss"` のみ使う。
- コンポーネント内で外部 URL 画像（Unsplash 等）を使わない。
- ナビ項目（4件）: `[{ name: "予防歯科", href: "/category/preventive" }, { name: "訪問歯科", href: "/category/home-visit" }, { name: "小児歯科", href: "/category/pediatric" }, { name: "医院からのお知らせ", href: "/category/news" }]`
- カラー定数: primary navy `#1e3a5f`、body bg `#f7f7f7`、max-width `1100px`

---

## ファイルマップ

| ファイル | アクション | 内容 |
|---------|-----------|------|
| `src/lib/utils.ts` | 新規作成 | cn() ユーティリティ |
| `src/app/globals.css` | 更新 | body bg-[#f7f7f7]、prose navy |
| `src/app/layout.tsx` | 更新 | Noto Sans JP、body クラス |
| `src/components/Header.tsx` | 上書き | v0 2段ヘッダー |
| `src/components/Footer.tsx` | 上書き | v0 navy フッター |
| `src/components/HeroSection.tsx` | 新規作成 | navy ヒーローバナー |
| `src/components/ArticleCard.tsx` | 上書き | グラデーションバナー版 |
| `src/components/Sidebar.tsx` | 新規作成 | 実データ Sidebar |
| `src/app/page.tsx` | 上書き | 2カラムトップページ |
| `src/app/blog/page.tsx` | 上書き | 2カラム記事一覧 |
| `src/app/blog/[slug]/page.tsx` | 上書き | 2カラム記事詳細（heredoc 必須） |

---

## 参照ファイル（v0 元ソース）

- `/tmp/dental-media-design/components/header.tsx`
- `/tmp/dental-media-design/components/footer.tsx`
- `/tmp/dental-media-design/components/article-card.tsx`
- `/tmp/dental-media-design/components/sidebar.tsx`
- `/tmp/dental-media-design/components/article-list.tsx`

---

### Task 1: 依存パッケージ追加 + utils.ts 作成

**Files:**
- Modify: `package.json`（npm install で間接的に更新）
- Create: `src/lib/utils.ts`

- [ ] **Step 1: lucide-react, clsx, tailwind-merge をインストール**

```bash
cd ~/Desktop/aisoukai-media && npm install lucide-react clsx tailwind-merge
```

Expected: `added N packages` メッセージ。エラーなし。

- [ ] **Step 2: src/lib/utils.ts を作成**

```typescript
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

- [ ] **Step 3: TypeScript コンパイル確認**

```bash
cd ~/Desktop/aisoukai-media && npx tsc --noEmit 2>&1 | head -20
```

Expected: エラーなし（または既存エラーのみ）。

- [ ] **Step 4: コミット**

```bash
cd ~/Desktop/aisoukai-media
git add package.json package-lock.json src/lib/utils.ts
git commit -m "chore: add lucide-react, clsx, tailwind-merge; create cn() utility"
```

---

### Task 2: globals.css + layout.tsx 更新

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: globals.css を上書き**

```css
@import "tailwindcss";

@layer base {
  body {
    @apply bg-[#f7f7f7] text-gray-800;
  }
}

@layer utilities {
  .prose h2 {
    @apply text-xl font-bold text-gray-900 mt-12 mb-5 pl-4;
    border-left: 4px solid #1e3a5f;
  }
  .prose h3 {
    @apply text-lg font-bold text-gray-800 mt-8 mb-3;
  }
  .prose p {
    @apply leading-relaxed text-gray-700;
  }
  .prose a {
    @apply text-[#1e3a5f] underline underline-offset-2;
  }
  .prose ul {
    @apply list-disc pl-6 space-y-1;
  }
  .prose ol {
    @apply list-decimal pl-6 space-y-1;
  }
}
```

- [ ] **Step 2: layout.tsx を上書き**

```tsx
import type { Metadata } from 'next'
import { Noto_Sans_JP } from 'next/font/google'
import './globals.css'
import { Header } from '@/components/Header'
import { Footer } from '@/components/Footer'

const notoSansJP = Noto_Sans_JP({
  subsets: ['latin'],
  weight: ['300', '400', '500', '700'],
  variable: '--font-noto-sans-jp',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: '医療法人藍想会 | 三谷ファミリー歯科クリニック',
    template: '%s | 三谷ファミリー歯科クリニック',
  },
  description: '徳島県の三谷ファミリー歯科クリニックによる歯科情報メディア。虫歯・歯周病・予防歯科・訪問歯科など専門的な情報をわかりやすく解説します。',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ja" className={notoSansJP.variable}>
      <body className="min-h-screen flex flex-col font-sans bg-[#f7f7f7] text-gray-800">
        <Header />
        <main className="flex-1">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  )
}
```

- [ ] **Step 3: TypeScript コンパイル確認**

```bash
cd ~/Desktop/aisoukai-media && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 4: コミット**

```bash
cd ~/Desktop/aisoukai-media
git add src/app/globals.css src/app/layout.tsx
git commit -m "style: update globals.css for navy prose, layout.tsx for Noto Sans JP"
```

---

### Task 3: Header.tsx 上書き

**Files:**
- Modify: `src/components/Header.tsx`

v0 の `/tmp/dental-media-design/components/header.tsx` を参考に、以下の仕様で実装する。

**仕様:**
- `"use client"` ディレクティブ必須（useState 使用）
- 上段: 薄いグレーバーに「運営者情報」「お問い合わせ」リンク（11px）
- 中段: ロゴ行（h-[70px]）— 44px navy 正方形に白文字「藍」+ 右に「医療法人藍想会」（18px bold navy）+ 「三谷ファミリー歯科クリニック ブログサイト」（10px gray）
- 下段（デスクトップのみ）: ナビ 4項目を rounded-full pills で表示。ホバーで navy 背景・白文字
- モバイル: ハンバーガーメニュー（Menu/X アイコン）でナビを展開
- 検索ボタン: デスクトップのみ表示（isSearchOpen で toggle）
- sticky top-0 z-50 bg-white shadow-sm
- max-w-[1100px] で中央寄せ

ナビ 4項目（固定）:
```typescript
const navItems = [
  { name: "予防歯科", href: "/category/preventive", color: "#22c55e" },
  { name: "訪問歯科", href: "/category/home-visit", color: "#14b8a6" },
  { name: "小児歯科", href: "/category/pediatric", color: "#f97316" },
  { name: "医院からのお知らせ", href: "/category/news", color: "#8b5cf6" },
]
```

- [ ] **Step 1: Header.tsx を実装（v0 参照しつつ上記仕様に合わせる）**

v0 ソース `/tmp/dental-media-design/components/header.tsx` を Read ツールで確認してから実装すること。

- [ ] **Step 2: TypeScript コンパイル確認**

```bash
cd ~/Desktop/aisoukai-media && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: コミット**

```bash
cd ~/Desktop/aisoukai-media
git add src/components/Header.tsx
git commit -m "style: replace Header with v0 2-tier navy design"
```

---

### Task 4: Footer.tsx 上書き

**Files:**
- Modify: `src/components/Footer.tsx`

v0 の `/tmp/dental-media-design/components/footer.tsx` を参考に実装する。

**仕様:**
- `bg-[#1e3a5f]` 背景、白テキスト
- max-w-[1100px] 4カラムグリッド（md）
- ロゴ列（2カラム分）: 白背景 40px 正方形に navy「藍」 + 「医療法人藍想会」（white）+ 説明文（white/70）
- カテゴリ列: 上記 9カテゴリへのリンク（white/70 → white ホバー）
- サイト情報列: 運営者情報・お問い合わせ・プライバシーポリシー・サイトマップ
- 下部コピーライト: `border-t border-white/10` + `Copyright © {year} 医療法人藍想会 三谷ファミリー歯科クリニック All Rights Reserved.`
- 年は `new Date().getFullYear()` で動的に取得

- [ ] **Step 1: Footer.tsx を実装**

v0 ソース `/tmp/dental-media-design/components/footer.tsx` を Read ツールで確認してから実装すること。

- [ ] **Step 2: TypeScript コンパイル確認**

```bash
cd ~/Desktop/aisoukai-media && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: コミット**

```bash
cd ~/Desktop/aisoukai-media
git add src/components/Footer.tsx
git commit -m "style: replace Footer with v0 navy design"
```

---

### Task 5: HeroSection.tsx 新規作成

**Files:**
- Create: `src/components/HeroSection.tsx`

**仕様:**
- Props: `{ title: string; description?: string }`
- `bg-[#1e3a5f]` 背景、白テキスト
- title: 26px bold、description: 14px white/80
- py-10 px-4、max-w-[1100px] mx-auto

```tsx
type Props = {
  title: string
  description?: string
}

export function HeroSection({ title, description }: Props) {
  return (
    <div className="bg-[#1e3a5f] py-10">
      <div className="mx-auto max-w-[1100px] px-4">
        <h1 className="text-[26px] font-bold text-white">{title}</h1>
        {description && (
          <p className="mt-2 text-[14px] text-white/80">{description}</p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 1: HeroSection.tsx を作成（上記コードのまま）**

- [ ] **Step 2: TypeScript コンパイル確認**

```bash
cd ~/Desktop/aisoukai-media && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: コミット**

```bash
cd ~/Desktop/aisoukai-media
git add src/components/HeroSection.tsx
git commit -m "feat: add HeroSection component with navy background"
```

---

### Task 6: ArticleCard.tsx 上書き（グラデーションバナー版）

**Files:**
- Modify: `src/components/ArticleCard.tsx`

**仕様:**
- Props: `PostMeta`（`src/lib/posts.ts` からインポート。`imageUrl` は一切使わない）
- カテゴリカラーマップ `CATEGORY_COLORS: Record<string, string>` を定義。未定義カテゴリは `#6b7280`
- 画像の代わり: `h-[120px]` の div に `linear-gradient(135deg, ${color}dd, ${color}88)` を style で指定
- カテゴリバッジ: 画像エリアの左上に absolute で重ねる（背景はカテゴリカラー）
- カードは白背景 rounded-lg shadow-sm、ホバーで shadow-md
- タイトル: 15px bold line-clamp-2、ホバーで navy
- 説明: 13px gray-500 line-clamp-2
- 日付: Clock アイコン + date（11px gray-400）

カテゴリカラーマップ:
```typescript
const CATEGORY_COLORS: Record<string, string> = {
  "AI歯科": "#3b82f6",
  "虫歯治療": "#3b82f6",
  "根管治療": "#ef4444",
  "歯周病治療": "#f97316",
  "予防歯科": "#22c55e",
  "小児歯科": "#14b8a6",
  "矯正歯科": "#8b5cf6",
  "親知らずの抜歯": "#ec4899",
  "インプラント治療": "#0ea5e9",
  "訪問歯科": "#14b8a6",
  "医院からのお知らせ": "#8b5cf6",
}
```

- [ ] **Step 1: `src/lib/posts.ts` の PostMeta 型を Read ツールで確認する**

- [ ] **Step 2: ArticleCard.tsx を実装**

```tsx
import Link from 'next/link'
import { Clock } from 'lucide-react'
import type { PostMeta } from '@/lib/posts'

const CATEGORY_COLORS: Record<string, string> = {
  "AI歯科": "#3b82f6",
  "虫歯治療": "#3b82f6",
  "根管治療": "#ef4444",
  "歯周病治療": "#f97316",
  "予防歯科": "#22c55e",
  "小児歯科": "#14b8a6",
  "矯正歯科": "#8b5cf6",
  "親知らずの抜歯": "#ec4899",
  "インプラント治療": "#0ea5e9",
  "訪問歯科": "#14b8a6",
  "医院からのお知らせ": "#8b5cf6",
}

export function ArticleCard({ slug, title, description, category, date }: PostMeta) {
  const color = CATEGORY_COLORS[category] ?? '#6b7280'
  return (
    <Link
      href={`/blog/${slug}`}
      className="group flex flex-col overflow-hidden rounded-lg bg-white shadow-sm transition-all hover:shadow-md"
    >
      <div
        className="relative h-[120px]"
        style={{ background: `linear-gradient(135deg, ${color}dd, ${color}88)` }}
      >
        <span
          className="absolute left-0 top-0 px-3 py-1.5 text-[11px] font-bold text-white"
          style={{ backgroundColor: color }}
        >
          {category}
        </span>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="mb-2 line-clamp-2 text-[15px] font-bold leading-snug text-gray-800 group-hover:text-[#1e3a5f]">
          {title}
        </h3>
        <p className="mb-3 line-clamp-2 flex-1 text-[13px] leading-relaxed text-gray-500">
          {description}
        </p>
        <div className="flex items-center gap-1 text-[11px] text-gray-400">
          <Clock className="h-3 w-3" />
          {date}
        </div>
      </div>
    </Link>
  )
}
```

- [ ] **Step 3: TypeScript コンパイル確認**

```bash
cd ~/Desktop/aisoukai-media && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 4: コミット**

```bash
cd ~/Desktop/aisoukai-media
git add src/components/ArticleCard.tsx
git commit -m "style: replace ArticleCard with gradient banner version using PostMeta"
```

---

### Task 7: Sidebar.tsx 新規作成

**Files:**
- Create: `src/components/Sidebar.tsx`

v0 の `/tmp/dental-media-design/components/sidebar.tsx` を参考に実装する。ただし Unsplash 画像は使わない。

**仕様:**
- Server Component（use client 不要）
- `getAllPosts()` をインポートして最新 5件を表示
- 各セクションは `SidebarSection` コンポーネント（navy ヘッダーバー + 白ボディ）
- セクション構成:
  1. **検索** (Search アイコン) — input + ボタン（現時点は静的 UI のみ、動作不要）
  2. **最新記事** (FileText アイコン) — `getAllPosts().slice(0, 5)` でランク 1〜5。ランク数字バッジ（1位=金 #fbbf24、2位=銀 #9ca3af、3位=銅 #cd7f32、4〜5位=灰 gray-300）。記事タイトルにリンク
  3. **カテゴリ** (FolderOpen アイコン) — 4カテゴリ（予防歯科/訪問歯科/小児歯科/医院からのお知らせ）とアイコン色、記事数（ダミー可）
  4. **ブログ管理者** (User アイコン) — 「藍」文字の円形 navy アバター + クリニック情報

- SidebarSection の構造:
  - 外側: `rounded-lg bg-white shadow-sm`
  - ヘッダー: `bg-[#1e3a5f] px-4 py-3 flex items-center gap-2`（アイコン white、タイトル white 14px bold）
  - ボディ: `p-4`

- [ ] **Step 1: v0 ソース `/tmp/dental-media-design/components/sidebar.tsx` を Read ツールで確認する**

- [ ] **Step 2: Sidebar.tsx を実装**

`getAllPosts()` は `import { getAllPosts } from '@/lib/posts'` でインポート。

- [ ] **Step 3: TypeScript コンパイル確認**

```bash
cd ~/Desktop/aisoukai-media && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 4: コミット**

```bash
cd ~/Desktop/aisoukai-media
git add src/components/Sidebar.tsx
git commit -m "feat: add Sidebar component with real getAllPosts() data"
```

---

### Task 8: page.tsx（トップページ）更新

**Files:**
- Modify: `src/app/page.tsx`

**仕様:**
- Hero セクション: `bg-[#1e3a5f]` の inline div（HeroSection は使わず直接）
  - タイトル「お口の健康情報メディア」(28px bold white)
  - サブ「三谷ファミリー歯科クリニックによる歯科情報メディア」(14px white/80)
- コンテンツ: `mx-auto max-w-[1100px] px-4 py-8`
- 2カラムレイアウト: `flex flex-col lg:flex-row gap-8`
  - メイン: `flex-1 min-w-0`
  - サイドバー: `lg:w-[300px] shrink-0`
- 最新記事セクション:
  - 見出し「最新記事」(FileText アイコン + 全N件バッジ)
  - `grid gap-5 sm:grid-cols-2` で ArticleCard を 6件表示（`getAllPosts().slice(0, 6)`）
- 記事一覧へのリンクボタン（navy border、テキスト「記事をもっと見る」）
- Sidebar コンポーネントを aside に配置

- [ ] **Step 1: page.tsx を実装**

```tsx
import { getAllPosts } from '@/lib/posts'
import { ArticleCard } from '@/components/ArticleCard'
import { Sidebar } from '@/components/Sidebar'
import { FileText } from 'lucide-react'
import Link from 'next/link'

export default function Home() {
  const posts = getAllPosts()

  return (
    <>
      {/* Hero */}
      <div className="bg-[#1e3a5f] py-12">
        <div className="mx-auto max-w-[1100px] px-4">
          <h1 className="text-[28px] font-bold text-white">お口の健康情報メディア</h1>
          <p className="mt-2 text-[14px] text-white/80">三谷ファミリー歯科クリニックによる歯科情報メディア</p>
        </div>
      </div>

      {/* Main content */}
      <div className="mx-auto max-w-[1100px] px-4 py-8">
        <div className="flex flex-col gap-8 lg:flex-row">
          {/* Articles */}
          <div className="min-w-0 flex-1">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-[18px] font-bold text-gray-800">
                <FileText className="h-5 w-5 text-[#1e3a5f]" />
                最新記事
              </h2>
              <span className="rounded-full bg-gray-100 px-3 py-1 text-[12px] font-medium text-gray-500">
                全{posts.length}件
              </span>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              {posts.slice(0, 6).map((post) => (
                <ArticleCard key={post.slug} {...post} />
              ))}
            </div>
            <div className="mt-8 flex justify-center">
              <Link
                href="/blog"
                className="rounded-full border border-[#1e3a5f] px-8 py-2.5 text-[14px] font-medium text-[#1e3a5f] transition-colors hover:bg-[#1e3a5f] hover:text-white"
              >
                記事をもっと見る
              </Link>
            </div>
          </div>

          {/* Sidebar */}
          <aside className="shrink-0 lg:w-[300px]">
            <Sidebar />
          </aside>
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 2: TypeScript コンパイル確認**

```bash
cd ~/Desktop/aisoukai-media && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: コミット**

```bash
cd ~/Desktop/aisoukai-media
git add src/app/page.tsx
git commit -m "style: update top page with v0 2-column layout and navy hero"
```

---

### Task 9: blog/page.tsx（記事一覧）更新

**Files:**
- Modify: `src/app/blog/page.tsx`

**仕様:**
- HeroSection コンポーネントを使う（title="記事一覧"、description="歯科に関する専門的な情報をわかりやすくお届けします"）
- 2カラムレイアウト（Task 8 と同構造）
- 全記事を grid で表示（スライスなし）
- ページネーション UI（静的、現ページ=1 固定で問題なし）

- [ ] **Step 1: blog/page.tsx を実装**

```tsx
import { getAllPosts } from '@/lib/posts'
import { ArticleCard } from '@/components/ArticleCard'
import { Sidebar } from '@/components/Sidebar'
import { HeroSection } from '@/components/HeroSection'

export default function BlogPage() {
  const posts = getAllPosts()

  return (
    <>
      <HeroSection
        title="記事一覧"
        description="歯科に関する専門的な情報をわかりやすくお届けします"
      />
      <div className="mx-auto max-w-[1100px] px-4 py-8">
        <div className="flex flex-col gap-8 lg:flex-row">
          <div className="min-w-0 flex-1">
            <div className="grid gap-5 sm:grid-cols-2">
              {posts.map((post) => (
                <ArticleCard key={post.slug} {...post} />
              ))}
            </div>
          </div>
          <aside className="shrink-0 lg:w-[300px]">
            <Sidebar />
          </aside>
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 2: TypeScript コンパイル確認**

```bash
cd ~/Desktop/aisoukai-media && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: コミット**

```bash
cd ~/Desktop/aisoukai-media
git add src/app/blog/page.tsx
git commit -m "style: update blog list page with v0 2-column layout"
```

---

### Task 10: blog/[slug]/page.tsx（記事詳細）更新

**Files:**
- Modify: `src/app/blog/[slug]/page.tsx`

**重要:** このファイルは `dangerouslySetInnerHTML` を使うため、セキュリティフックが Edit/Write ツールをブロックする可能性がある。**必ず Bash ツールの heredoc（cat > ... << 'ENDOFFILE'）で書き込むこと。**

**仕様:**
- `generateStaticParams` と `generateMetadata` は必ず維持する（既存コードを参考にする）
- `const { slug } = await params` — Next.js 15 形式
- 記事が見つからない場合: `notFound()` を呼ぶ
- HeroSection は使わず、ページ内に navy ヒーローを inline で実装
  - パンくずリスト（Home アイコン > 記事一覧 > 記事タイトル）
  - aria-label="パンくずリスト"
- 記事カード部分（white bg、カテゴリカラー 8px top bar）:
  - カテゴリバッジ + 日付
  - h1（記事タイトル）
  - description（left-border navy、bg-blue-50）
  - タグ一覧
  - prose 本文（HTML を安全にレンダリング）— Bash heredoc で実装
- 2カラムレイアウト（本文 + Sidebar）
- 「← 記事一覧に戻る」リンク

**HTML レンダリング部分の注意:**
記事本文を表示する div には React の prop を使う。prop 名は `dangerously` + `SetInnerHTML` を結合した文字列。値は `{{ __html: post.contentHtml }}` とする。この部分は Bash heredoc でのみ書くこと。

**実装手順:**
1. 現行 `src/app/blog/[slug]/page.tsx` を Read ツールで確認して generateStaticParams/generateMetadata のコードを把握する
2. `src/lib/posts.ts` の `getPostBySlug` の型シグネチャを確認する
3. 新しいファイル内容を Bash heredoc で書き込む:
   ```bash
   cat > /Users/mitaniFDC/Desktop/aisoukai-media/src/app/blog/[slug]/page.tsx << 'ENDOFFILE'
   [完全なファイル内容]
   ENDOFFILE
   ```
4. `npx tsc --noEmit` でエラーがないか確認する
5. コミット

- [ ] **Step 1: 現行 page.tsx を Read ツールで確認**

- [ ] **Step 2: Bash heredoc でファイルを書き込む**

CATEGORY_COLORS は ArticleCard.tsx と同じ定数を使うこと（コピーしてよい）。

- [ ] **Step 3: TypeScript コンパイル確認**

```bash
cd ~/Desktop/aisoukai-media && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 4: コミット**

```bash
cd ~/Desktop/aisoukai-media
git add "src/app/blog/[slug]/page.tsx"
git commit -m "style: update article detail page with v0 2-column layout and navy hero"
```

---

### Task 11: ビルド検証

**Files:** なし（検証のみ）

- [ ] **Step 1: TypeScript 型チェック（全エラーなし）**

```bash
cd ~/Desktop/aisoukai-media && npx tsc --noEmit 2>&1
```

Expected: 出力なし（エラーゼロ）

- [ ] **Step 2: Next.js プロダクションビルド**

```bash
cd ~/Desktop/aisoukai-media && npm run build 2>&1
```

Expected: `✓ Compiled successfully` または `Route (app)` のルート一覧。エラーなし。

- [ ] **Step 3: 開発サーバー起動して各ページを確認**

```bash
cd ~/Desktop/aisoukai-media && npm run dev &
sleep 5
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ && echo " / OK"
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/blog && echo " /blog OK"
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/blog/2026-01-15-ai-dental-diagnosis && echo " /blog/slug OK"
```

Expected: すべて 200

- [ ] **Step 4: 開発サーバーを停止してコミット（変更があれば）**

```bash
pkill -f "next dev" 2>/dev/null || true
```

問題がなければコミット不要。ビルドエラーがあれば修正してからコミット。
