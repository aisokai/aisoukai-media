import type { Metadata } from 'next'
import { getPendingReviewPosts } from '@/lib/posts'
import { getRecentReviewLog } from '@/lib/reviewLog'
import { NOINDEX_METADATA } from '@/lib/seo'
import CopyButton from './CopyButton'

export const metadata: Metadata = {
  title: 'Pending Review | Admin',
  ...NOINDEX_METADATA,
}

export default function PendingReviewPage() {
  const today    = new Date().toISOString().slice(0, 10)
  const allPosts = getPendingReviewPosts()
  const pending  = allPosts.filter((p) => !p.rejectionReason)
  const rejected = allPosts.filter((p) =>  p.rejectionReason)
  const recentLog = getRecentReviewLog(10)

  return (
    <div className="mx-auto max-w-[900px] px-4 py-10">

      {/* ── ヘッダー ── */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-800">Human Review 待ち記事</h1>
        <p className="mt-1 text-sm text-gray-500">
          reviewed: false の記事一覧。
          <strong className="text-red-600">承認・公開ボタンはありません。</strong>
          コマンドをコピーして CLI で実行してください。
        </p>
        <div className="mt-3 rounded border border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-600">
          <p className="mb-2 font-semibold text-gray-700">
            各記事の「📋 承認コマンドをコピー」「📋 差戻コマンドをコピー」ボタンを使ってください
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <p className="rounded bg-white px-3 py-2 font-mono text-[11px] text-gray-700">
              承認: npm run approve:post -- &lt;slug&gt; --reviewed-by &quot;氏名&quot;
            </p>
            <p className="rounded bg-white px-3 py-2 font-mono text-[11px] text-gray-700">
              差戻: npm run reject:post -- &lt;slug&gt; --reason &quot;理由&quot; --reviewed-by &quot;氏名&quot;
            </p>
          </div>
        </div>
      </div>

      {/* ── 通常 pending セクション ── */}
      <section>
        <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-gray-700">
          レビュー待ち
          <span className="rounded-full bg-yellow-100 px-2.5 py-0.5 text-sm font-bold text-yellow-800">
            {pending.length} 件
          </span>
        </h2>

        {pending.length === 0 ? (
          <div className="rounded-lg border border-green-200 bg-green-50 px-6 py-10 text-center text-green-700">
            Review 待ちの記事はありません。
          </div>
        ) : (
          <div className="space-y-5">
            {pending.map((post) => {
              const effectiveDate     = post.publishAt ?? post.date
              const isFutureScheduled = effectiveDate > today
              const approveCmd = `npm run approve:post -- ${post.slug} --reviewed-by "氏名"`
              const rejectCmd  = `npm run reject:post  -- ${post.slug} --reason "差し戻し理由"`

              return (
                <div
                  key={post.slug}
                  className={`rounded-xl border-2 bg-white p-5 shadow-sm ${
                    isFutureScheduled ? 'border-orange-300' : 'border-gray-200'
                  }`}
                >
                  {/* タイトル + バッジ */}
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="text-base font-semibold text-gray-800">{post.title}</h3>
                    <div className="flex flex-wrap gap-1.5">
                      <span className="rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-semibold text-yellow-800">
                        未承認
                      </span>
                      {post.aiGenerated && (
                        <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
                          AI生成
                        </span>
                      )}
                      {isFutureScheduled && (
                        <span className="rounded-full bg-orange-500 px-2.5 py-0.5 text-xs font-bold text-white">
                          📅 未来日 {effectiveDate}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 未来日注意バナー */}
                  {isFutureScheduled && (
                    <div className="mt-3 flex items-start gap-2 rounded-lg border border-orange-300 bg-orange-50 px-4 py-3">
                      <span className="text-lg">⚠️</span>
                      <p className="text-sm text-orange-800">
                        公開予定日（{effectiveDate}）が未来のため、approved にしても
                        <strong>その日が来るまでビルドに含まれません</strong>。
                      </p>
                    </div>
                  )}

                  {/* excerpt */}
                  {post.excerpt && (
                    <p className="mt-3 line-clamp-2 text-sm text-gray-500">{post.excerpt}</p>
                  )}

                  {/* メタ情報 */}
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 rounded bg-gray-50 p-3 text-xs sm:grid-cols-4">
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

                  {/* コマンド + Copy ボタン */}
                  <div className="mt-4 grid gap-2">
                    {/* 承認コマンド */}
                    <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-2.5">
                      <span className="shrink-0 rounded-full bg-green-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                        approve
                      </span>
                      <code className="flex-1 break-all font-mono text-xs text-green-800">
                        {approveCmd}
                      </code>
                      <CopyButton text={approveCmd} label="📋 承認コマンドをコピー" variant="approve" />
                    </div>
                    {/* 差し戻しコマンド */}
                    <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5">
                      <span className="shrink-0 rounded-full bg-gray-700 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                        reject
                      </span>
                      <code className="flex-1 break-all font-mono text-xs text-gray-500">
                        {rejectCmd}
                      </code>
                      <CopyButton text={rejectCmd} label="📋 差戻コマンドをコピー" variant="reject" />
                    </div>
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
            修正後に <code>generate:draft --force</code> または <code>approve:post</code> で再処理してください。
          </p>
          <div className="space-y-2">
            {rejected.map((post) => {
              const approveCmd = `npm run approve:post -- ${post.slug} --reviewed-by "氏名"`
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
                  <div className="mt-2 flex items-center gap-3 rounded border border-gray-200 bg-white px-3 py-2">
                    <code className="flex-1 break-all font-mono text-xs text-gray-400">
                      {approveCmd}
                    </code>
                    <CopyButton text={approveCmd} label="📋 コピー" variant="default" />
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* ── 承認履歴ログ ── */}
      <section className="mt-12">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-base font-semibold text-gray-500">Review History</h2>
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-sm font-bold text-slate-700">
            最新 {recentLog.length > 0 ? Math.min(recentLog.length, 10) : 0} 件
          </span>
        </div>

        {recentLog.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-6 py-8 text-sm text-gray-500">
            review history はまだありません
          </div>
        ) : (
          <div className="space-y-2">
            {recentLog.map((entry) => {
              const isApprove = entry.action === 'approve'
              const statusLabel = isApprove ? 'approve' : 'reject'
              const statusStyle = isApprove
                ? 'border-green-200 bg-green-50'
                : 'border-red-200 bg-red-50'
              const badgeStyle = isApprove
                ? 'bg-green-600 text-white'
                : 'bg-red-600 text-white'

              return (
                <div key={`${entry.datetime}-${entry.slug}`} className={`rounded-xl border p-4 ${statusStyle}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${badgeStyle}`}>
                        {statusLabel}
                      </span>
                      <span className="font-mono text-xs font-semibold text-gray-700">{entry.slug}</span>
                    </div>
                    <span className="font-mono text-[11px] text-gray-500">
                      {entry.datetime.slice(0, 16).replace('T', ' ')}
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
