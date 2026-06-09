import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft, FileEdit } from 'lucide-react'
import { isAdminAuthenticated } from '@/lib/adminAuth'
import { type AdminPost, getAdminPosts } from '@/lib/adminPosts'
import { NOINDEX_METADATA } from '@/lib/seo'
import PostManagementActions from './PostManagementActions'

export const metadata: Metadata = {
  title: 'Posts | Admin',
  ...NOINDEX_METADATA,
}

export const dynamic = 'force-dynamic'

type PageProps = {
  searchParams?: Promise<{
    status?: string
    category?: string
    ai?: string
    sort?: string
  }>
}

function getAdminPostStatus(post: AdminPost) {
  if (post.archived) return 'archived'
  if (post.rejectionReason) return 'rejected'
  if (post.reviewed) return 'reviewed'
  return 'pending'
}

function statusLabel(status: string) {
  if (status === 'archived') return 'アーカイブ'
  if (status === 'rejected') return '差し戻し'
  if (status === 'reviewed') return '承認済み'
  return '未承認'
}

function sortPostsForAdmin(posts: AdminPost[], sort: string) {
  return [...posts].sort((a, b) => {
    if (sort === 'title') return a.title.localeCompare(b.title, 'ja')
    if (sort === 'status') return getAdminPostStatus(a).localeCompare(getAdminPostStatus(b))
    const ad = a.publishAt ?? a.date
    const bd = b.publishAt ?? b.date
    return sort === 'oldest'
      ? ad.localeCompare(bd) || a.slug.localeCompare(b.slug)
      : bd.localeCompare(ad) || b.slug.localeCompare(a.slug)
  })
}

export default async function AdminPostsPage({ searchParams }: PageProps) {
  if (!(await isAdminAuthenticated())) redirect('/admin/login')

  const params = await searchParams
  const statusFilter = params?.status ?? 'all'
  const categoryFilter = params?.category ?? 'all'
  const aiFilter = params?.ai ?? 'all'
  const sort = params?.sort ?? 'newest'
  const posts = await getAdminPosts()
  const live = posts.filter((post) => post.reviewed && !post.draft && !post.archived && !post.rejectionReason).length
  const pending = posts.filter((post) => !post.reviewed && !post.archived && !post.rejectionReason).length
  const archived = posts.filter((post) => post.archived).length
  const categories = [...new Set(posts.map((post) => post.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ja'))
  const filteredPosts = sortPostsForAdmin(
    posts.filter((post) => {
      const status = getAdminPostStatus(post)
      if (statusFilter !== 'all' && status !== statusFilter) return false
      if (categoryFilter !== 'all' && post.category !== categoryFilter) return false
      if (aiFilter === 'yes' && !post.aiGenerated) return false
      if (aiFilter === 'no' && post.aiGenerated) return false
      return true
    }),
    sort,
  )

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link href="/admin" className="inline-flex items-center gap-1 text-sm font-semibold text-gray-500 hover:text-gray-900">
            <ArrowLeft className="h-4 w-4" />
            管理トップ
          </Link>
          <h1 className="mt-3 flex items-center gap-2 text-2xl font-bold text-gray-900">
            <FileEdit className="h-6 w-6 text-blue-700" />
            記事管理
          </h1>
          <p className="mt-2 text-sm text-gray-500">記事の手動編集、アーカイブ、復帰、削除を行います。</p>
        </div>
      </div>

      <section className="mt-6 grid gap-3 sm:grid-cols-3">
        <Metric label="公開対象" value={live} />
        <Metric label="レビュー待ち" value={pending} tone="amber" />
        <Metric label="アーカイブ" value={archived} tone="slate" />
      </section>

      <form method="get" className="mt-6 grid gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm md:grid-cols-5">
        <FilterSelect label="状態" name="status" value={statusFilter}>
          <option value="all">すべて</option>
          <option value="pending">未承認</option>
          <option value="rejected">差し戻し</option>
          <option value="reviewed">承認済み</option>
          <option value="archived">アーカイブ</option>
        </FilterSelect>
        <FilterSelect label="カテゴリ" name="category" value={categoryFilter}>
          <option value="all">すべて</option>
          {categories.map((category) => (
            <option key={category} value={category}>{category}</option>
          ))}
        </FilterSelect>
        <FilterSelect label="AI生成" name="ai" value={aiFilter}>
          <option value="all">すべて</option>
          <option value="yes">AI生成のみ</option>
          <option value="no">AI生成以外</option>
        </FilterSelect>
        <FilterSelect label="並び順" name="sort" value={sort}>
          <option value="newest">新しい順</option>
          <option value="oldest">古い順</option>
          <option value="title">タイトル順</option>
          <option value="status">状態順</option>
        </FilterSelect>
        <div className="flex items-end gap-2">
          <button className="w-full rounded-md bg-gray-900 px-3 py-2 text-sm font-bold text-white hover:bg-gray-800">
            絞り込む
          </button>
        </div>
      </form>

      <section className="mt-8 grid gap-4 lg:grid-cols-2">
        {filteredPosts.map((post) => {
          const status = statusLabel(getAdminPostStatus(post))
          return (
            <article key={post.slug} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusStyle(status)}`}>{status}</span>
                <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700">{post.category}</span>
                {post.aiGenerated && <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-700">AI生成</span>}
              </div>
              <h2 className="mt-3 text-base font-bold leading-snug text-gray-900">{post.title}</h2>
              <p className="mt-1 font-mono text-xs text-gray-500">{post.slug}</p>
              <p className="mt-2 line-clamp-2 text-sm text-gray-600">{post.excerpt}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                <span>date: {post.date}</span>
                {post.publishAt && <span>publish_at: {post.publishAt}</span>}
              </div>
              {post.archiveReason && <p className="mt-2 text-xs text-slate-600">archive: {post.archiveReason}</p>}
              {post.rejectionReason && <p className="mt-2 text-xs text-red-600">reject: {post.rejectionReason}</p>}
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <Link
                  href={`/admin/posts/${post.slug}/edit`}
                  className="rounded-md bg-blue-700 px-3 py-2 text-center text-xs font-bold text-white hover:bg-blue-800"
                >
                  手動編集
                </Link>
                {!post.archived && post.reviewed && (
                  <Link
                    href={`/blog/${post.slug}`}
                    className="rounded-md bg-gray-100 px-3 py-2 text-center text-xs font-bold text-gray-700 hover:bg-gray-200"
                  >
                    公開ページ
                  </Link>
                )}
              </div>
              <PostManagementActions slug={post.slug} archived={post.archived} />
            </article>
          )
        })}
        {filteredPosts.length === 0 && (
          <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-sm text-gray-500 lg:col-span-2">
            条件に合う記事はありません。
          </div>
        )}
      </section>
    </main>
  )
}

function FilterSelect({
  label,
  name,
  value,
  children,
}: {
  label: string
  name: string
  value: string
  children: React.ReactNode
}) {
  return (
    <label className="text-xs font-bold text-gray-600">
      {label}
      <select name={name} defaultValue={value} className="mt-1 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800">
        {children}
      </select>
    </label>
  )
}

function statusStyle(status: string) {
  if (status === '承認済み') return 'bg-green-100 text-green-800'
  if (status === '未承認') return 'bg-yellow-100 text-yellow-800'
  if (status === '差し戻し') return 'bg-red-100 text-red-800'
  return 'bg-slate-100 text-slate-800'
}

function Metric({ label, value, tone = 'green' }: { label: string; value: number; tone?: 'green' | 'amber' | 'slate' }) {
  const styles = {
    green: 'border-green-100 bg-green-50 text-green-900',
    amber: 'border-amber-100 bg-amber-50 text-amber-900',
    slate: 'border-slate-100 bg-slate-50 text-slate-900',
  }
  return (
    <div className={`rounded-lg border p-4 ${styles[tone]}`}>
      <p className="text-xs font-bold text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  )
}
