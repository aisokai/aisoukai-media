import type { Metadata } from 'next'
import { getPendingReviewPosts } from '@/lib/posts'
import { NOINDEX_METADATA } from '@/lib/seo'

export const metadata: Metadata = {
  title: 'Pending Review | Admin',
  ...NOINDEX_METADATA,
}

export default function PendingReviewPage() {
  const allPosts = getPendingReviewPosts()
  const pending  = allPosts.filter((p) => !p.rejectionReason)
  const rejected = allPosts.filter((p) =>  p.rejectionReason)

  return (
    <div className="mx-auto max-w-[900px] px-4 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-800">Human Review 待ち記事</h1>
        <p className="mt-1 text-sm text-gray-500">
          reviewed: false の記事一覧。承認・差し戻しは CLI で実行してください。
        </p>
        <pre className="mt-2 rounded bg-gray-100 px-3 py-2 text-xs text-gray-600">
          npm run approve:post -- {'<slug>'} --reviewed-by &quot;氏名&quot;{'\n'}
          npm run reject:post  -- {'<slug>'} --reason &quot;差し戻し理由&quot;
        </pre>
      </div>

      {/* ── 通常 pending セクション ── */}
      {pending.length === 0 ? (
        <div className="rounded-lg border border-green-200 bg-green-50 px-6 py-10 text-center text-green-700">
          Review 待ちの記事はありません。
        </div>
      ) : (
        <>
          <p className="mb-4 text-sm text-gray-500">レビュー待ち: {pending.length} 件</p>
          <div className="space-y-4">
            {pending.map((post) => (
              <div
                key={post.slug}
                className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h2 className="text-base font-semibold text-gray-800">{post.title}</h2>
                  <div className="flex flex-wrap gap-1.5">
                    <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800">
                      未承認
                    </span>
                    {post.aiGenerated && (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                        AI生成
                      </span>
                    )}
                  </div>
                </div>

                {post.excerpt && (
                  <p className="mt-2 line-clamp-2 text-sm text-gray-500">{post.excerpt}</p>
                )}

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

                <div className="mt-3 rounded bg-gray-50 px-3 py-1.5 font-mono text-xs text-gray-500">
                  npm run approve:post -- {post.slug} --reviewed-by &quot;氏名&quot;
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── 差し戻し済みセクション ── */}
      {rejected.length > 0 && (
        <div className="mt-10">
          <h2 className="mb-3 text-base font-semibold text-gray-500">
            差し戻し済み ({rejected.length} 件)
          </h2>
          <div className="space-y-2">
            {rejected.map((post) => (
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
                <p className="mt-1 font-mono text-xs text-gray-400">{post.slug}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
