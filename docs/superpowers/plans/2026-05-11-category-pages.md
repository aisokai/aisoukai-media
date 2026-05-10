# Category Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/category/*` の 404 を解消し、カテゴリ別記事一覧ページを1ファイルで実装する。

**Architecture:** `src/app/category/[slug]/page.tsx` を新規作成する。slug→日本語カテゴリ名マップを定義し、`getAllPosts()` をカテゴリでフィルタして表示。不正 slug のみ `notFound()` を呼び、記事ゼロのカテゴリは「まだ記事がありません」と表示する。既存の `HeroSection` / `ArticleCard` / `Sidebar` を再利用してデザインを統一する。

**Tech Stack:** Next.js 15 App Router (SSG), TypeScript, Tailwind CSS v4, gray-matter, src/lib/posts.ts

---

## File Structure

| 操作 | ファイル |
|------|---------|
| Create | `src/app/category/[slug]/page.tsx` |
| Read (参照のみ) | `src/lib/posts.ts` — `getAllPosts()`, `PostMeta` 型 |
| Read (参照のみ) | `src/components/HeroSection.tsx` — `HeroSection({ title, description? })` |
| Read (参照のみ) | `src/components/ArticleCard.tsx` — `ArticleCard(PostMeta)` |
| Read (参照のみ) | `src/components/Sidebar.tsx` — `Sidebar()` |

---

### Task 1: カテゴリページ実装 + ビルド確認

**Files:**
- Create: `src/app/category/[slug]/page.tsx`

#### 事前確認

- [ ] **Step 1: Next.js 15 の params 型を確認する**

  `src/app/blog/[slug]/page.tsx` が存在するプロジェクトの場合、Next.js 15 App Router では dynamic params は `Promise<{ slug: string }>` 型になる。`await params` が必須。

  確認コマンド:
  ```bash
  head -30 src/app/blog/[slug]/page.tsx 2>/dev/null || echo "ファイルなし"
  ```

#### 実装

- [ ] **Step 2: `src/app/category/[slug]/page.tsx` を作成する**

  以下の内容を書く:

  ```tsx
  import { notFound } from 'next/navigation'
  import type { Metadata } from 'next'
  import { getAllPosts } from '@/lib/posts'
  import { ArticleCard } from '@/components/ArticleCard'
  import { Sidebar } from '@/components/Sidebar'
  import { HeroSection } from '@/components/HeroSection'

  const CATEGORY_SLUG_MAP: Record<string, string> = {
    'cavity':       '虫歯治療',
    'root-canal':   '根管治療',
    'periodontal':  '歯周病治療',
    'preventive':   '予防歯科',
    'pediatric':    '小児歯科',
    'wisdom-tooth': '親知らず',
    'implant':      'インプラント',
    'other':        'その他',
    'news':         'お知らせ',
  }

  type Props = {
    params: Promise<{ slug: string }>
  }

  export function generateStaticParams() {
    return Object.keys(CATEGORY_SLUG_MAP).map((slug) => ({ slug }))
  }

  export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { slug } = await params
    const category = CATEGORY_SLUG_MAP[slug]
    if (!category) return {}
    return {
      title: `${category}の記事一覧 | 三谷ファミリー歯科クリニック`,
      description: `${category}に関する記事の一覧ページです。歯科の専門情報をわかりやすくお届けします。`,
    }
  }

  export default async function CategoryPage({ params }: Props) {
    const { slug } = await params
    const category = CATEGORY_SLUG_MAP[slug]

    if (!category) notFound()

    const posts = getAllPosts().filter((p) => p.category === category)

    return (
      <>
        <HeroSection
          title={category}
          description={`${category}に関する記事の一覧です`}
        />
        <div className="mx-auto max-w-[1100px] px-4 py-8">
          <div className="flex flex-col gap-8 lg:flex-row">
            <div className="min-w-0 flex-1">
              {posts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <p className="text-[15px] font-medium text-gray-500">まだ記事がありません</p>
                  <p className="mt-2 text-[13px] text-gray-400">近日公開予定です。しばらくお待ちください。</p>
                </div>
              ) : (
                <div className="grid gap-5 sm:grid-cols-2">
                  {posts.map((post) => (
                    <ArticleCard key={post.slug} {...post} />
                  ))}
                </div>
              )}
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

#### 検証

- [ ] **Step 3: TypeScript 型チェックを実行する**

  ```bash
  cd ~/Desktop/aisoukai-media && npx tsc --noEmit
  ```

  Expected: エラーなし（警告のみの場合は内容を確認）

- [ ] **Step 4: ビルドを実行する**

  ```bash
  cd ~/Desktop/aisoukai-media && npm run build
  ```

  Expected:
  - エラーなし
  - 出力に `/category/cavity`, `/category/root-canal` ... `/category/news` の9ルートが SSG として列挙される

#### コミット

- [ ] **Step 5: コミットする**

  ```bash
  cd ~/Desktop/aisoukai-media
  git add src/app/category/
  git commit -m "feat: add category pages (/category/*)"
  ```

---

## Self-Review チェック

### Spec coverage

| 要件 | 対応タスク |
|------|----------|
| `src/app/category/[slug]/page.tsx` 作成 | Task 1 Step 2 |
| slug→カテゴリ名マッピング定義 | Task 1 Step 2 (CATEGORY_SLUG_MAP) |
| getAllPosts() でカテゴリフィルタ | Task 1 Step 2 (posts.filter) |
| 記事ゼロでも404にしない | Task 1 Step 2 (posts.length === 0 分岐) |
| 不正slugのみ notFound() | Task 1 Step 2 (!category → notFound()) |
| generateStaticParams | Task 1 Step 2 |
| generateMetadata | Task 1 Step 2 |
| ArticleCard/Sidebar/Header/Footer とデザイン統一 | Task 1 Step 2 (既存コンポーネント再利用) |
| npm run build 通過 | Task 1 Step 4 |

すべての要件を1タスクでカバー。ファイル1本の追加のみ。既存ファイルへの変更なし。
