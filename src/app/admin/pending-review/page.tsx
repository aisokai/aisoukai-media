import type { Metadata } from 'next'
import { getPendingReviewPosts } from '@/lib/posts'
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

  return (
    <div className="mx-auto max-w-[900px] px-4 py-10">

      {/* ── ヘッダー ── */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-800">Human Review 待ち記事</h1>
        <p className="mt-1 text-sm text-gray-500">
          reviewed: false の記事一覧。承認・差し戻しは CLI で実行してください。
          <strong className="text-red-600"> 承認・公開ボタンはありません。</strong>
        </p>
        <div className="mt-3 rounded border border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-600">
          <p className="mb-1 font-semibold text-gray-700">操作コマンド（各記事の Copy ボタンからコピー）</p>
          <p>承認: <code>npm run approve:post -- &lt;slug&gt; --reviewed-by &quot;氏名&quot;</code></p>
          <p>差戻: <code>npm run reject:post  -- &lt;slug&gt; --reason &quot;理由&quot;</code></p>
        </div>
      </div>

      {/* ── 通常 pending セクション ── */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-gray-700">
          レビュー待ち
          <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800">
            {pending.length} 件
          </span>
        </h2>

        {pending.length === 0 ? (
          <div className="rounded-lg border border-green-200 bg-green-50 px-6 py-10 text-center text-green-700">
            Review 待ちの記事はありません。
          </div>
        ) : (
          <div className="space-y-4">
            {pending.map((post) => {
              const effectiveDate    = post.publishAt ?? post.date
              const isFutureScheduled = effectiveDate > today
              const approveCmd       = `npm run approve:post -- ${post.slug} --reviewed-by "氏名"`
              const rejectCmd        = `npm run reject:post  -- ${post.slug} --reason "差し戻し理由"`

              return (
                <div
                  key={post.slug}
                  className={`rounded-lg border bg-white p-5 shadow-sm ${
                    isFutureScheduled ? 'border-orange-200' : 'border-gray-200'
                  }`}
                >
                  {/* タイトル + バッジ */}
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="text-base font-semibold text-gray-800">{post.title}</h3>
                    <div className="flex flex-wrap gap-1.5">
                      <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800">
                        未承認
                      </span>
                      {post.aiGenerated && (
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                          AI生成
                        </span>
                      )}
                      {isFutureScheduled && (
                        <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
                          📅 スケジュール済み（{effectiveDate}）
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 未来日注意 */}
                  {isFutureScheduled && (
                    <p className="mt-2 rounded border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs text-orange-700">
                      ⚠️ 公開予定日が未来（{effectiveDate}）のため、approved にしてもその日までビルドに含まれません。
                    </p>
                  )}

                  {/* excerpt */}
                  {post.excerpt && (
                    <p className="mt-2 line-clamp-2 text-sm text-gray-500">{post.excerpt}</p>
                  )}

                  {/* メタ情報 */}
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
                    <div>
                      <dt className="font-medium text-gray-600">slug</dt>
                      <dd className="break-all font-mono text-gray-500">{post.slug}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-gray-600">date</dt>
                      <dd className="text-gray-500">{post.date}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-gray-600">publish_at</dt>
                      <dd className="text-gray-500">{post.publishAt ?? '—'}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-gray-600">category</dt>
                      <dd className="text-gray-500">{post.category}</dd>
                    </div>
                  </dl>

                  {/* コマンド + Copy ボタン */}
                  <div className="mt-3 space-y-1.5">
                    <div className="flex items-center gap-2 rounded bg-green-50 px-3 py-1.5">
                      <code className="flex-1 break-all font-mono text-xs text-green-800">
                        {approveCmd}
                      </code>
                      <CopyButton text={approveCmd} label="Copy 承認" />
                    </div>
                    <div className="flex items-center gap-2 rounded bg-gray-50 px-3 py-1.5">
                      <code className="flex-1 break-all font-mono text-xs text-gray-500">
                        {rejectCmd}
                      </code>
                      <CopyButton text={rejectCmd} label="Copy 差戻" />
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
        <section className="mt-10">
          <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-gray-500">
            差し戻し済み
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
              {rejected.length} 件
            </span>
          </h2>
          <p className="mb-3 text-xs text-gray-400">
            ※ 差し戻し済み記事は修正後に generate:draft --force または approve:post で再処理してください。
          </p>
          <div className="space-y-2">
            {rejected.map((post) => {
              const approveCmd = `npm run approve:post -- ${post.slug} --reviewed-by "氏名"`
              return (
                <div
                  key={post.slug}
                  className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-gray-700">{post.title}</span>
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                      差し戻し
                    </span>
                  </div>
                  {post.rejectionReason && (
                    <p className="mt-1 text-xs text-red-600">理由: {post.rejectionReason}</p>
                  )}
                  <div className="mt-2 flex items-center gap-2 rounded bg-white px-3 py-1.5">
                    <code className="flex-1 break-all font-mono text-xs text-gray-400">
                      {approveCmd}
                    </code>
                    <CopyButton text={approveCmd} label="Copy" />
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
