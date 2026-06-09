import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { type PendingReviewPost, getPendingReviewPostsForAdmin } from '@/lib/posts'
import { getRecentReviewLogForAdmin } from '@/lib/reviewLog'
import { NOINDEX_METADATA } from '@/lib/seo'
import { isAdminAuthenticated } from '@/lib/adminAuth'
import { ArrowLeft } from 'lucide-react'
import PostBodyPreview from './PostBodyPreview'
import ReviewerNameClient from './ReviewerNameClient'
import ReviewActionButtons from './ReviewActionButtons'

export const metadata: Metadata = {
  title: 'Pending Review | Admin',
  ...NOINDEX_METADATA,
}

export const dynamic = 'force-dynamic'

type PageProps = {
  searchParams?: Promise<{ status?: string }>
}

function formatLogDatetime(datetime: string) {
  return datetime.slice(0, 19).replace('T', ' ')
}

function renderReviewPostCard({
  post,
  today,
  isDuplicate,
}: {
  post: PendingReviewPost
  today: string
  isDuplicate: boolean
}) {
  const effectiveDate = post.publishAt ?? post.date
  const isFutureScheduled = effectiveDate > today
  const isRejected = Boolean(post.rejectionReason)

  return (
    <div
      key={post.slug}
      className={`rounded-2xl border-2 bg-white shadow-sm ${
        isRejected ? 'border-red-200' : isFutureScheduled ? 'border-orange-300' : 'border-gray-200'
      }`}
    >
      <div className="flex flex-wrap gap-1.5 px-4 pt-4">
        {isDuplicate && (
          <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">
            ⚠️ 重複候補
          </span>
        )}
        {isFutureScheduled && (
          <span className="rounded-full bg-orange-500 px-2.5 py-0.5 text-xs font-bold text-white">
            📅 未来日 {effectiveDate}
          </span>
        )}
        {post.aiGenerated && (
          <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
            AI生成
          </span>
        )}
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${isRejected ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>
          {isRejected ? '差し戻し' : '未承認'}
        </span>
      </div>

      <div className="px-4 pt-2 pb-4">
        <h3 className="text-base font-semibold leading-snug text-gray-800">
          {post.title}
        </h3>

        <div className="mt-2 flex items-center gap-3">
          {post.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={post.image}
              alt={post.title}
              width={80}
              height={80}
              className="h-[80px] w-[80px] shrink-0 rounded-lg object-cover"
            />
          )}
          <div className="text-xs text-gray-500">
            <p className="font-semibold text-gray-600">{post.category}</p>
            <p className={isFutureScheduled ? 'font-bold text-orange-600' : ''}>
              {post.date}
            </p>
            {post.publishAt && (
              <p className={post.publishAt > today ? 'font-bold text-orange-600' : ''}>
                公開: {post.publishAt}
              </p>
            )}
          </div>
        </div>

        {post.excerpt && (
          <p className="mt-2 line-clamp-2 text-sm text-gray-500">{post.excerpt}</p>
        )}

        {post.rejectionReason && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
            <p className="text-xs font-bold text-red-800">差し戻し理由</p>
            <p className="mt-1 text-xs leading-5 text-red-700">{post.rejectionReason}</p>
          </div>
        )}

        {isFutureScheduled && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-orange-300 bg-orange-50 px-3 py-2">
            <span>⚠️</span>
            <p className="text-xs text-orange-800">
              公開予定日（{effectiveDate}）が未来のため、approved にしても
              <strong>その日が来るまで非公開</strong>です。
            </p>
          </div>
        )}

        <ReviewActionButtons slug={post.slug} title={post.title} />

        <details className="mt-3 text-xs" open={isRejected}>
          <summary className="cursor-pointer select-none text-gray-500 hover:text-gray-700">
            ▶ slug / メタ情報 / 本文プレビュー
          </summary>
          <div className="mt-2 space-y-2">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg bg-gray-50 p-3 sm:grid-cols-4">
              <div>
                <dt className="font-semibold text-gray-600">slug</dt>
                <dd className="break-all font-mono text-gray-500">{post.slug}</dd>
              </div>
              <div>
                <dt className="font-semibold text-gray-600">date</dt>
                <dd className={isFutureScheduled ? 'font-bold text-orange-600' : 'text-gray-500'}>
                  {post.date}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-gray-600">publish_at</dt>
                <dd className={post.publishAt && post.publishAt > today ? 'font-bold text-orange-600' : 'text-gray-500'}>
                  {post.publishAt ?? '—'}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-gray-600">category</dt>
                <dd className="text-gray-500">{post.category}</dd>
              </div>
            </dl>

            {post.contentHtml && (
              <PostBodyPreview contentHtml={post.contentHtml} />
            )}
          </div>
        </details>
      </div>
    </div>
  )
}

export default async function PendingReviewPage({ searchParams }: PageProps) {
  if (!(await isAdminAuthenticated())) redirect('/admin/login')

  const params = await searchParams
  const statusFilter = params?.status ?? 'pending'
  const today = new Date().toISOString().slice(0, 10)
  const allPosts = await getPendingReviewPostsForAdmin()
  const pending = allPosts.filter((p) => !p.rejectionReason)
  const rejected = allPosts.filter((p) =>  p.rejectionReason)
  const showPending = statusFilter === 'pending' || statusFilter === 'all'
  const showRejected = statusFilter === 'rejected' || statusFilter === 'all'
  const recentLog = await getRecentReviewLogForAdmin(8)

  // 簡易重複検出: タイトルが完全一致する slug の組
  const titleToSlugs = new Map<string, string[]>()
  for (const post of pending) {
    const existing = titleToSlugs.get(post.title) ?? []
    titleToSlugs.set(post.title, [...existing, post.slug])
  }
  const duplicateSlugs = new Set<string>()
  for (const slugs of titleToSlugs.values()) {
    if (slugs.length > 1) slugs.forEach((s) => duplicateSlugs.add(s))
  }

  return (
    <div className="mx-auto max-w-[640px] px-4 py-8">

      {/* ── ヘッダー ── */}
      <div className="mb-6">
        <Link href="/admin" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-gray-500 hover:text-gray-900">
          <ArrowLeft className="h-4 w-4" />
          管理トップ
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-gray-800">Human Review 待ち</h1>
          <span className="rounded-full bg-yellow-100 px-3 py-1 text-sm font-bold text-yellow-800">
            {statusFilter === 'rejected' ? rejected.length : statusFilter === 'all' ? allPosts.length : pending.length} 件
          </span>
        </div>

        {/* 承認者表示 */}
        <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
          <ReviewerNameClient />
        </div>

        {/* 操作ガイド */}
        <p className="mt-3 text-sm text-gray-500">
          内容を確認し、スマホから承認・却下できます。操作はGitHub commitとして記録されます。
        </p>

        {/* バッジ凡例 */}
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          <span className="flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-orange-700">
            📅 未来日 — その日まで非公開
          </span>
          <span className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-red-700">
            ⚠️ 重複候補 — タイトル重複
          </span>
        </div>
      </div>

      <nav className="mb-6 grid grid-cols-3 gap-2 text-center text-sm font-bold">
        <a href="/admin/pending-review?status=pending" className={`rounded-lg border px-3 py-2 ${statusFilter === 'pending' ? 'border-yellow-300 bg-yellow-50 text-yellow-800' : 'border-gray-200 bg-white text-gray-600'}`}>
          レビュー待ち
        </a>
        <a href="/admin/pending-review?status=rejected" className={`rounded-lg border px-3 py-2 ${statusFilter === 'rejected' ? 'border-red-300 bg-red-50 text-red-800' : 'border-gray-200 bg-white text-gray-600'}`}>
          差し戻し
        </a>
        <a href="/admin/pending-review?status=all" className={`rounded-lg border px-3 py-2 ${statusFilter === 'all' ? 'border-blue-300 bg-blue-50 text-blue-800' : 'border-gray-200 bg-white text-gray-600'}`}>
          すべて
        </a>
      </nav>

      {/* ── 通常 pending セクション ── */}
      {showPending && <section>
        {pending.length === 0 ? (
          <div className="rounded-lg border border-green-200 bg-green-50 px-6 py-10 text-center text-green-700">
            Review 待ちの記事はありません。
          </div>
        ) : (
          <div className="space-y-5">
            {pending.map((post) => renderReviewPostCard({ post, today, isDuplicate: duplicateSlugs.has(post.slug) }))}
          </div>
        )}
      </section>}

      {/* ── 差し戻し済みセクション ── */}
      {showRejected && rejected.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-gray-500">
            差し戻し済み
            <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-sm font-bold text-red-700">
              {rejected.length} 件
            </span>
          </h2>
          <p className="mb-4 text-xs text-gray-400">
            内容を確認し、問題なければこの画面から再承認できます。
          </p>
          <div className="space-y-5">
            {rejected.map((post) => renderReviewPostCard({ post, today, isDuplicate: false }))}
          </div>
        </section>
      )}

      {/* ── 承認履歴ログ ── */}
      <section className="mt-12">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-base font-semibold text-gray-700">Review History</h2>
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-sm font-bold text-slate-700">
            最新 {recentLog.length} 件
          </span>
        </div>

        {recentLog.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-6 py-8 text-sm text-gray-500">
            review history はまだありません
          </div>
        ) : (
          <div className="space-y-3">
            {recentLog.map((entry) => {
              const isApprove = entry.action === 'approve'
              const cardStyle = isApprove
                ? 'border-green-200 bg-green-50/70'
                : 'border-red-200 bg-red-50/70'
              const badgeStyle = isApprove
                ? 'bg-green-600 text-white'
                : 'bg-red-600 text-white'

              return (
                <div key={`${entry.datetime}-${entry.slug}`} className={`rounded-2xl border p-4 ${cardStyle}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${badgeStyle}`}>
                        {entry.action}
                      </span>
                      <span className="font-mono text-xs font-semibold text-gray-700">{entry.slug}</span>
                    </div>
                    <span className="font-mono text-[11px] text-gray-500">
                      {formatLogDatetime(entry.datetime)}
                    </span>
                  </div>

                  <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
                    <div className="rounded-lg bg-white/80 px-3 py-2">
                      <dt className="font-semibold text-gray-500">reviewed_by</dt>
                      <dd className="mt-0.5 text-gray-700">{entry.reviewedBy ?? '—'}</dd>
                    </div>
                    <div className="rounded-lg bg-white/80 px-3 py-2">
                      <dt className="font-semibold text-gray-500">date</dt>
                      <dd className="mt-0.5 font-mono text-gray-700">{entry.date ?? '—'}</dd>
                    </div>
                    <div className="rounded-lg bg-white/80 px-3 py-2">
                      <dt className="font-semibold text-gray-500">publish_at</dt>
                      <dd className="mt-0.5 font-mono text-gray-700">{entry.publishAt ?? '—'}</dd>
                    </div>
                    <div className="rounded-lg bg-white/80 px-3 py-2 sm:col-span-2 lg:col-span-3">
                      <dt className="font-semibold text-gray-500">reject_reason</dt>
                      <dd className="mt-0.5 text-gray-700">{entry.rejectReason ?? '—'}</dd>
                    </div>
                    <div className="rounded-lg bg-white/80 px-3 py-2 sm:col-span-2 lg:col-span-3">
                      <dt className="font-semibold text-gray-500">datetime</dt>
                      <dd className="mt-0.5 font-mono text-gray-700">{entry.datetime}</dd>
                    </div>
                  </dl>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
