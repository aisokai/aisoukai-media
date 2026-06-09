import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getPendingReviewPostsForAdmin } from '@/lib/posts'
import { getRecentReviewLogForAdmin } from '@/lib/reviewLog'
import { NOINDEX_METADATA } from '@/lib/seo'
import { isAdminAuthenticated } from '@/lib/adminAuth'
import PostBodyPreview from './PostBodyPreview'
import ReviewerNameClient from './ReviewerNameClient'
import ReviewActionButtons from './ReviewActionButtons'

export const metadata: Metadata = {
  title: 'Pending Review | Admin',
  ...NOINDEX_METADATA,
}

export const dynamic = 'force-dynamic'

function formatLogDatetime(datetime: string) {
  return datetime.slice(0, 19).replace('T', ' ')
}

export default async function PendingReviewPage() {
  if (!(await isAdminAuthenticated())) redirect('/admin/login')

  const today = new Date().toISOString().slice(0, 10)
  const allPosts = await getPendingReviewPostsForAdmin()
  const pending = allPosts.filter((p) => !p.rejectionReason)
  const rejected = allPosts.filter((p) =>  p.rejectionReason)
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-gray-800">Human Review 待ち</h1>
          <span className="rounded-full bg-yellow-100 px-3 py-1 text-sm font-bold text-yellow-800">
            {pending.length} 件
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

      {/* ── 通常 pending セクション ── */}
      <section>
        {pending.length === 0 ? (
          <div className="rounded-lg border border-green-200 bg-green-50 px-6 py-10 text-center text-green-700">
            Review 待ちの記事はありません。
          </div>
        ) : (
          <div className="space-y-5">
            {pending.map((post) => {
              const effectiveDate     = post.publishAt ?? post.date
              const isFutureScheduled = effectiveDate > today
              const isDuplicate       = duplicateSlugs.has(post.slug)
              return (
                <div
                  key={post.slug}
                  className={`rounded-2xl border-2 bg-white shadow-sm ${
                    isFutureScheduled ? 'border-orange-300' : 'border-gray-200'
                  }`}
                >
                  {/* バッジ行 */}
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
                    <span className="rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-semibold text-yellow-800">
                      未承認
                    </span>
                  </div>

                  <div className="px-4 pt-2 pb-4">
                    {/* タイトル */}
                    <h3 className="text-base font-semibold leading-snug text-gray-800">
                      {post.title}
                    </h3>

                    {/* サムネイル + カテゴリ + 日付 */}
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

                    {/* excerpt */}
                    {post.excerpt && (
                      <p className="mt-2 line-clamp-2 text-sm text-gray-500">{post.excerpt}</p>
                    )}

                    {/* 未来日注意バナー */}
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

                    {/* 折りたたみ: 本文プレビュー + メタ情報 */}
                    <details className="mt-3 text-xs">
                      <summary className="cursor-pointer select-none text-gray-400 hover:text-gray-600">
                        ▶ slug / メタ情報 / 本文プレビュー
                      </summary>
                      <div className="mt-2 space-y-2">
                        {/* メタ情報 */}
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

                        {/* 本文プレビュー */}
                        {post.contentHtml && (
                          <PostBodyPreview contentHtml={post.contentHtml} />
                        )}
                      </div>
                    </details>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* ── 差し戻し済みセクション ── */}
      {rejected.length > 0 && (
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
          <div className="space-y-2">
            {rejected.map((post) => {
              return (
                <div
                  key={post.slug}
                  className="rounded-lg border border-red-100 bg-red-50 px-4 py-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-gray-700">{post.title}</span>
                    <span className="rounded-full bg-red-200 px-2.5 py-0.5 text-xs font-bold text-red-800">
                      差し戻し
                    </span>
                  </div>
                  {post.rejectionReason && (
                    <p className="mt-1 text-xs text-red-600">
                      理由: {post.rejectionReason}
                    </p>
                  )}
                  <ReviewActionButtons slug={post.slug} title={post.title} />
                </div>
              )
            })}
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
