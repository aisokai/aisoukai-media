# aisoukai-media 初期構築 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AI運用前提の歯科メディアサイト基盤を Next.js App Router + TypeScript strict + Tailwind CSS で構築し、Markdown記事管理・ブログ機能・医療ミニマルデザインを提供する。

**Architecture:** ファイルシステムベースのMarkdown記事管理（`/content/posts/*.md`）。`gray-matter`でfrontmatterをパース、`remark`+`remark-html`でHTML変換。CMS・DB・認証なし。AIによる記事自動生成時は `content/posts/` への Markdown ファイル追加のみで拡張可能。

**Tech Stack:** Next.js 14+ (App Router), TypeScript strict, Tailwind CSS v3, ESLint, gray-matter, remark, remark-html

---

## ファイル構成

```
aisoukai-media/
├── content/
│   └── posts/
│       └── 2026-01-15-ai-dental-diagnosis.md   # ダミー記事
├── src/
│   ├── app/
│   │   ├── layout.tsx                           # ルートレイアウト
│   │   ├── page.tsx                             # トップページ
│   │   ├── globals.css                          # グローバルスタイル
│   │   └── blog/
│   │       ├── page.tsx                         # ブログ一覧ページ
│   │       └── [slug]/
│   │           └── page.tsx                     # 記事詳細ページ
│   ├── components/
│   │   ├── Header.tsx
│   │   ├── Footer.tsx
│   │   └── ArticleCard.tsx
│   └── lib/
│       └── posts.ts                             # Markdown読み取りユーティリティ
├── public/
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── package.json
└── README.md
```

---

## Task 1: Next.js プロジェクト初期化

**Files:**
- Create: `package.json`, `next.config.ts`, `tsconfig.json`, `tailwind.config.ts`, `src/app/globals.css`, `src/app/layout.tsx`, `src/app/page.tsx`

- [ ] **Step 1: create-next-app で初期化**

```bash
cd ~/Desktop
npx create-next-app@latest aisoukai-media \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir \
  --no-import-alias \
  --yes
```

Expected: `aisoukai-media/` 配下に Next.js プロジェクトが生成される。

- [ ] **Step 2: tsconfig.json の strict モードを確認**

```bash
cd ~/Desktop/aisoukai-media
grep '"strict"' tsconfig.json
```

Expected: `"strict": true` が出力される。もし `false` なら `sed -i '' 's/"strict": false/"strict": true/' tsconfig.json` で修正。

- [ ] **Step 3: 開発サーバーが起動することを確認**

```bash
cd ~/Desktop/aisoukai-media
npm run dev &
sleep 5
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
kill %1
```

Expected: `200` が出力される。

- [ ] **Step 4: 初期 commit**

```bash
cd ~/Desktop/aisoukai-media
git init
git add -A
git commit -m "chore: initialize Next.js project with TypeScript strict + Tailwind + ESLint"
```

---

## Task 2: 追加依存パッケージのインストール

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Markdown処理ライブラリをインストール**

```bash
cd ~/Desktop/aisoukai-media
npm install gray-matter remark remark-html
```

- [ ] **Step 2: インストール確認**

```bash
cd ~/Desktop/aisoukai-media
node -e "require('gray-matter'); console.log('OK')"
```

Expected: `OK` が出力される。

- [ ] **Step 3: commit**

```bash
cd ~/Desktop/aisoukai-media
git add package.json package-lock.json
git commit -m "chore: add gray-matter, remark, remark-html"
```

---

## Task 3: コンテンツ構造とダミー記事

**Files:**
- Create: `content/posts/2026-01-15-ai-dental-diagnosis.md`

- [ ] **Step 1: content/posts ディレクトリを作成**

```bash
mkdir -p ~/Desktop/aisoukai-media/content/posts
```

- [ ] **Step 2: ダミー記事を作成**

`content/posts/2026-01-15-ai-dental-diagnosis.md` を作成する（frontmatter + 本文）：

```
---
title: "AIが変える歯科診断の未来：最新技術と歯科医療への応用"
date: "2026-01-15"
description: "AI技術が歯科診断にどのような変革をもたらすか。画像診断、リスク予測、治療計画立案への活用事例を専門家の視点で解説します。"
category: "AI歯科"
tags:
  - AI
  - 歯科診断
  - 医療テクノロジー
---

## はじめに

人工知能（AI）技術の急速な進化は、医療分野全体に革命をもたらしつつあります。歯科医療も例外ではなく、画像診断から治療計画まで、AIが歯科臨床の質と効率を大きく向上させると期待されています。

## AI歯科診断の現在地

### 画像診断支援

デジタルX線やCTスキャンの画像をAIが解析し、虫歯・歯周病・骨吸収などの病変を自動検出する技術は実用段階に入っています。従来は見落としが生じやすかった微小な病変も、AIの高精度な画像認識によって早期発見が可能になりつつあります。

### リスク予測モデル

患者の診療記録、生活習慣データ、遺伝情報などを組み合わせ、将来的な口腔疾患リスクを予測するモデルも研究が進んでいます。予防歯科の観点から、個別化された口腔健康管理が実現できます。

## 歯科医院での導入事例

実際の歯科医院では以下のような形でAIが活用されています：

- **予約・問診の自動化**: チャットボットによる症状ヒアリングと優先度判定
- **治療計画の可視化**: インプラントや矯正治療のシミュレーション
- **患者教育コンテンツ**: 個別のケアプランに基づく説明資料の自動生成

## 課題と展望

AI歯科診断の普及には、医師の責任範囲の明確化、データプライバシーの確保、医療機器としての規制対応など、解決すべき課題も残っています。しかし技術の進化とともに、これらの課題は順次クリアされていくと考えられます。

## まとめ

AIは歯科医師の判断を補助し、より精度の高い診断と治療計画の立案を支援するツールです。歯科医師の専門性と経験にAIの分析力を組み合わせることで、患者にとってより良い医療体験が実現できるでしょう。

愛走会では、最新のAI技術動向を継続的にお届けし、歯科医療の未来を一緒に考えていきます。
```

- [ ] **Step 3: commit**

```bash
cd ~/Desktop/aisoukai-media
git add content/
git commit -m "content: add dummy article about AI dental diagnosis"
```

---

## Task 4: posts.ts ライブラリ

**Files:**
- Create: `src/lib/posts.ts`

- [ ] **Step 1: src/lib ディレクトリを作成**

```bash
mkdir -p ~/Desktop/aisoukai-media/src/lib
```

- [ ] **Step 2: posts.ts を作成**

`src/lib/posts.ts`:

```typescript
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { remark } from 'remark';
import remarkHtml from 'remark-html';

const POSTS_DIR = path.join(process.cwd(), 'content/posts');

export type PostMeta = {
  slug: string;
  title: string;
  date: string;
  description: string;
  category: string;
  tags: string[];
};

export type Post = PostMeta & {
  contentHtml: string;
};

export function getAllPosts(): PostMeta[] {
  if (!fs.existsSync(POSTS_DIR)) return [];

  const fileNames = fs.readdirSync(POSTS_DIR).filter((f) => f.endsWith('.md'));

  const posts = fileNames.map((fileName): PostMeta => {
    const slug = fileName.replace(/\.md$/, '');
    const fullPath = path.join(POSTS_DIR, fileName);
    const fileContents = fs.readFileSync(fullPath, 'utf8');
    const { data } = matter(fileContents);

    return {
      slug,
      title: data.title as string,
      date: data.date as string,
      description: data.description as string,
      category: data.category as string,
      tags: (data.tags as string[]) ?? [],
    };
  });

  return posts.sort((a, b) => (a.date < b.date ? 1 : -1));
}

export async function getPostBySlug(slug: string): Promise<Post | null> {
  const fullPath = path.join(POSTS_DIR, `${slug}.md`);
  if (!fs.existsSync(fullPath)) return null;

  const fileContents = fs.readFileSync(fullPath, 'utf8');
  const { data, content } = matter(fileContents);

  // remarkHtml の sanitize オプションで XSS を防ぐ。
  // content/posts/ は管理者のみ編集可能な信頼済みソース。
  const processed = await remark()
    .use(remarkHtml, { sanitize: true })
    .process(content);
  const contentHtml = processed.toString();

  return {
    slug,
    title: data.title as string,
    date: data.date as string,
    description: data.description as string,
    category: data.category as string,
    tags: (data.tags as string[]) ?? [],
    contentHtml,
  };
}
```

- [ ] **Step 3: 動作確認**

```bash
cd ~/Desktop/aisoukai-media
npx tsx -e "
import { getAllPosts } from './src/lib/posts.ts';
const posts = getAllPosts();
console.log('count:', posts.length);
console.log('title:', posts[0]?.title);
"
```

Expected:
```
count: 1
title: AIが変える歯科診断の未来：最新技術と歯科医療への応用
```

- [ ] **Step 4: commit**

```bash
cd ~/Desktop/aisoukai-media
git add src/lib/posts.ts
git commit -m "feat: add posts library with getAllPosts and getPostBySlug"
```

---

## Task 5: グローバルスタイル・Header・Footer・layout.tsx

**Files:**
- Modify: `src/app/globals.css`
- Create: `src/components/Header.tsx`
- Create: `src/components/Footer.tsx`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: src/components ディレクトリを作成**

```bash
mkdir -p ~/Desktop/aisoukai-media/src/components
```

- [ ] **Step 2: globals.css を更新（既存内容を全置換）**

`src/app/globals.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  html {
    font-family: 'Hiragino Kaku Gothic ProN', 'Hiragino Sans', 'Noto Sans JP',
      'Meiryo', sans-serif;
    -webkit-font-smoothing: antialiased;
  }

  body {
    @apply bg-slate-50 text-slate-800;
  }

  /* 記事本文 typography */
  .prose h2 {
    @apply text-xl font-bold text-slate-900 mt-10 mb-4 pb-2 border-b border-slate-200;
  }
  .prose h3 {
    @apply text-lg font-semibold text-slate-800 mt-8 mb-3;
  }
  .prose p {
    @apply text-slate-700 leading-relaxed mb-6;
  }
  .prose ul {
    @apply list-disc list-inside space-y-1 mb-6 text-slate-700;
  }
  .prose li {
    @apply leading-relaxed;
  }
  .prose strong {
    @apply font-semibold text-slate-900;
  }
}
```

- [ ] **Step 3: Header.tsx を作成**

`src/components/Header.tsx`:

```tsx
import Link from 'next/link';

export default function Header() {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 group">
          <span className="text-teal-600 text-lg font-bold tracking-tight group-hover:text-teal-700 transition-colors">
            愛走会メディア
          </span>
          <span className="text-xs text-slate-400 hidden sm:inline">
            歯科医療の最前線
          </span>
        </Link>
        <nav className="flex items-center gap-6 text-sm text-slate-600">
          <Link href="/" className="hover:text-teal-600 transition-colors">
            ホーム
          </Link>
          <Link href="/blog" className="hover:text-teal-600 transition-colors">
            記事一覧
          </Link>
        </nav>
      </div>
    </header>
  );
}
```

- [ ] **Step 4: Footer.tsx を作成**

`src/components/Footer.tsx`:

```tsx
export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-slate-200 bg-white mt-auto">
      <div className="max-w-3xl mx-auto px-4 py-6 text-center text-xs text-slate-400">
        <p>© {year} 愛走会メディア. All rights reserved.</p>
        <p className="mt-1">歯科医療・AI技術の最新情報をお届けします</p>
      </div>
    </footer>
  );
}
```

- [ ] **Step 5: layout.tsx を更新（既存内容を全置換）**

`src/app/layout.tsx`:

```tsx
import type { Metadata } from 'next';
import './globals.css';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

export const metadata: Metadata = {
  title: {
    default: '愛走会メディア | 歯科医療・AI技術の最新情報',
    template: '%s | 愛走会メディア',
  },
  description:
    '歯科医療・AI技術・口腔健康に関する最新情報を専門家の視点でお届けする歯科メディアです。',
  metadataBase: new URL('https://media.aisoukai.jp'),
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
```

- [ ] **Step 6: commit**

```bash
cd ~/Desktop/aisoukai-media
git add src/app/globals.css src/components/Header.tsx src/components/Footer.tsx src/app/layout.tsx
git commit -m "feat: add layout, Header, Footer with medical minimal design"
```

---

## Task 6: ArticleCard コンポーネント

**Files:**
- Create: `src/components/ArticleCard.tsx`

- [ ] **Step 1: ArticleCard.tsx を作成**

`src/components/ArticleCard.tsx`:

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
    <article className="bg-white rounded-lg border border-slate-200 p-6 hover:border-teal-300 hover:shadow-sm transition-all">
      <Link href={`/blog/${post.slug}`} className="block group">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs font-medium text-teal-600 bg-teal-50 px-2 py-0.5 rounded">
            {post.category}
          </span>
          <time className="text-xs text-slate-400">{formattedDate}</time>
        </div>
        <h2 className="text-base font-semibold text-slate-900 leading-snug group-hover:text-teal-700 transition-colors mb-2">
          {post.title}
        </h2>
        <p className="text-sm text-slate-500 leading-relaxed line-clamp-2">
          {post.description}
        </p>
        <div className="flex flex-wrap gap-1.5 mt-4">
          {post.tags.map((tag) => (
            <span
              key={tag}
              className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded"
            >
              #{tag}
            </span>
          ))}
        </div>
      </Link>
    </article>
  );
}
```

- [ ] **Step 2: commit**

```bash
cd ~/Desktop/aisoukai-media
git add src/components/ArticleCard.tsx
git commit -m "feat: add ArticleCard component"
```

---

## Task 7: トップページ

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: page.tsx を更新（既存内容を全置換）**

`src/app/page.tsx`:

```tsx
import Link from 'next/link';
import { getAllPosts } from '@/lib/posts';
import ArticleCard from '@/components/ArticleCard';

export default function HomePage() {
  const recentPosts = getAllPosts().slice(0, 3);

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <section className="mb-14 text-center">
        <p className="text-xs font-medium text-teal-600 tracking-widest uppercase mb-3">
          Dental Media
        </p>
        <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 leading-tight mb-4">
          歯科医療の最新情報を、
          <br className="hidden sm:block" />
          わかりやすくお届けします
        </h1>
        <p className="text-slate-500 text-sm sm:text-base leading-relaxed max-w-xl mx-auto">
          AI技術・歯科治療・口腔健康に関するコンテンツを専門家監修のもと発信する歯科メディアです。
        </p>
      </section>

      {recentPosts.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-slate-900">最新記事</h2>
            <Link
              href="/blog"
              className="text-sm text-teal-600 hover:text-teal-700 transition-colors"
            >
              すべて見る →
            </Link>
          </div>
          <div className="space-y-4">
            {recentPosts.map((post) => (
              <ArticleCard key={post.slug} post={post} />
            ))}
          </div>
        </section>
      )}

      {recentPosts.length === 0 && (
        <section className="text-center py-16 text-slate-400">
          <p>記事を準備中です。しばらくお待ちください。</p>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 2: commit**

```bash
cd ~/Desktop/aisoukai-media
git add src/app/page.tsx
git commit -m "feat: add top page with hero and recent posts"
```

---

## Task 8: ブログ一覧ページ

**Files:**
- Create: `src/app/blog/page.tsx`

- [ ] **Step 1: blog ディレクトリを作成**

```bash
mkdir -p ~/Desktop/aisoukai-media/src/app/blog
```

- [ ] **Step 2: blog/page.tsx を作成**

`src/app/blog/page.tsx`:

```tsx
import type { Metadata } from 'next';
import { getAllPosts } from '@/lib/posts';
import ArticleCard from '@/components/ArticleCard';

export const metadata: Metadata = {
  title: '記事一覧',
  description: '歯科医療・AI技術に関する最新記事の一覧です。',
};

export default function BlogPage() {
  const posts = getAllPosts();

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <div className="mb-10">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">記事一覧</h1>
        <p className="text-sm text-slate-400">{posts.length}件の記事</p>
      </div>

      {posts.length > 0 ? (
        <div className="space-y-4">
          {posts.map((post) => (
            <ArticleCard key={post.slug} post={post} />
          ))}
        </div>
      ) : (
        <div className="text-center py-16 text-slate-400">
          <p>記事を準備中です。しばらくお待ちください。</p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: commit**

```bash
cd ~/Desktop/aisoukai-media
git add src/app/blog/page.tsx
git commit -m "feat: add blog list page"
```

---

## Task 9: 記事詳細ページ

**Files:**
- Create: `src/app/blog/[slug]/page.tsx`

セキュリティ注記: Markdown本文は `remark-html` が `sanitize: true` で処理済み。`content/posts/` は管理者のみが編集可能な信頼済みソースであるため、Server Componentでの innerHTML 挿入は安全。

- [ ] **Step 1: [slug] ディレクトリを作成**

```bash
mkdir -p ~/Desktop/aisoukai-media/src/app/blog/\[slug\]
```

- [ ] **Step 2: blog/[slug]/page.tsx を作成**

`src/app/blog/[slug]/page.tsx`:

```tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getAllPosts, getPostBySlug } from '@/lib/posts';

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  return getAllPosts().map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
  if (!post) return {};
  return { title: post.title, description: post.description };
}

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
  if (!post) notFound();

  const formattedDate = new Date(post.date).toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <nav className="text-xs text-slate-400 mb-8 flex items-center gap-2">
        <Link href="/" className="hover:text-teal-600 transition-colors">ホーム</Link>
        <span>/</span>
        <Link href="/blog" className="hover:text-teal-600 transition-colors">記事一覧</Link>
        <span>/</span>
        <span className="text-slate-500 truncate">{post.title}</span>
      </nav>

      <header className="mb-10">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs font-medium text-teal-600 bg-teal-50 px-2 py-0.5 rounded">
            {post.category}
          </span>
          <time className="text-xs text-slate-400">{formattedDate}</time>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 leading-tight mb-4">
          {post.title}
        </h1>
        <p className="text-slate-500 leading-relaxed">{post.description}</p>
        <div className="flex flex-wrap gap-1.5 mt-4">
          {post.tags.map((tag) => (
            <span key={tag} className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
              #{tag}
            </span>
          ))}
        </div>
      </header>

      {/* contentHtml は remark-html(sanitize:true) で処理済みの信頼済みHTML */}
      <div className="prose" dangerouslySetInnerHTML={{ __html: post.contentHtml }} />

      <div className="mt-12 pt-8 border-t border-slate-200">
        <Link href="/blog" className="text-sm text-teal-600 hover:text-teal-700 transition-colors">
          ← 記事一覧に戻る
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: commit**

```bash
cd ~/Desktop/aisoukai-media
git add "src/app/blog/[slug]/page.tsx"
git commit -m "feat: add article detail page with metadata and breadcrumbs"
```

---

## Task 10: README.md 更新

**Files:**
- Modify: `README.md`

- [ ] **Step 1: README.md を更新**

`README.md` の内容を以下に置き換える：

```markdown
# aisoukai-media

愛走会が運営する歯科メディアサイト。AI運用前提で設計された Next.js + Markdown ベースのコンテンツ基盤。

## 技術スタック

| 技術 | 用途 |
|------|------|
| Next.js 14+ (App Router) | フレームワーク |
| TypeScript strict | 型安全 |
| Tailwind CSS v3 | スタイリング |
| gray-matter | Markdown frontmatter パース |
| remark / remark-html | Markdown → HTML 変換 |

## 開発

npm install && npm run dev

→ http://localhost:3000

## ディレクトリ構成

aisoukai-media/
├── content/posts/       # 記事置き場（AI自動生成記事もここへ）
├── src/
│   ├── app/             # App Router ページ
│   │   ├── page.tsx         # トップページ
│   │   └── blog/
│   │       ├── page.tsx         # 記事一覧
│   │       └── [slug]/page.tsx  # 記事詳細
│   ├── components/      # Header, Footer, ArticleCard
│   └── lib/posts.ts     # Markdown読み取りユーティリティ
└── public/

## 記事の追加方法

content/posts/ に YYYY-MM-DD-slug.md 形式でファイルを追加するだけ。

frontmatter 必須フィールド:
  title / date / description / category / tags

## AI自動記事生成の拡張ポイント

1. content/posts/ へ frontmatter 付き Markdown を追加するだけで公開
2. src/lib/posts.ts の PostMeta 型を参照して frontmatter を構成
3. npm run build → Vercel / GitHub Actions でデプロイ自動化可能
4. OGP画像生成: opengraph-image.tsx を各ページに追加で SNS対応
```

- [ ] **Step 2: commit**

```bash
cd ~/Desktop/aisoukai-media
git add README.md
git commit -m "docs: update README with structure, usage, and AI extension points"
```

---

## Task 11: 動作確認

- [ ] **Step 1: ビルドエラーなしを確認**

```bash
cd ~/Desktop/aisoukai-media
npm run build 2>&1 | tail -20
```

Expected: `Route (app)` のルート一覧が表示され、エラーなし。

- [ ] **Step 2: TypeScript 型エラーなしを確認**

```bash
cd ~/Desktop/aisoukai-media
npx tsc --noEmit
```

Expected: 出力なし（エラーゼロ）

- [ ] **Step 3: 開発サーバーで3ページ確認**

```bash
cd ~/Desktop/aisoukai-media && npm run dev
```

確認対象:
- http://localhost:3000 — トップページ（ヒーロー + 記事カード）
- http://localhost:3000/blog — 記事一覧（1件）
- http://localhost:3000/blog/2026-01-15-ai-dental-diagnosis — 記事詳細

---

## Self-Review チェックリスト

| 要件 | 対応タスク |
|------|----------|
| Next.js App Router | Task 1 |
| TypeScript strict | Task 1 Step 2 |
| Tailwind CSS | Task 1, Task 5 |
| ESLint | Task 1 |
| src構成 | Task 1 |
| `/content/posts` Markdown | Task 3, Task 4 |
| AI記事自動生成対応構造 | Task 4, Task 10 README |
| トップページ | Task 7 |
| ブログ一覧ページ | Task 8 |
| 記事詳細ページ | Task 9 |
| ダミー記事1件 | Task 3 |
| レスポンシブ | Task 5〜9（sm: ブレークポイント使用） |
| 日本語対応 | Task 5（lang="ja", フォント指定） |
| 医療ミニマルデザイン | Task 5（白背景, teal/slate配色） |
| npm run dev で起動 | Task 11 |
| README.md 更新 | Task 10 |
| CMS/DB/認証なし | 全タスク通じてライブラリ追加なし |

型の一貫性:
- `PostMeta` → Task 4定義、Task 6/7/8で使用 ✓
- `Post = PostMeta & { contentHtml }` → Task 4定義、Task 9で使用 ✓
- `getPostBySlug` → `Promise<Post | null>` → Task 9で `notFound()` ガード ✓
