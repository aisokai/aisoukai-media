import type { Metadata } from 'next'
import { getPendingReviewPosts } from '@/lib/posts'
import { NOINDEX_METADATA } from '@/lib/seo'

export const metadata: Metadata = {
  title: 'Pending Review | Admin',
  ...NOINDEX_METADATA,
}

export default function PendingReviewPage() {
  const posts = getPendingReviewPosts()

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

      {posts.length === 0 ? (
        <div className="rounded-lg border border-green-200 bg-green-50 px-6 py-10 text-center text-green-700">
          Review 待ちの記事はありません。
        </div>
      ) : (
        <>
          <p className="mb-4 text-sm text-gray-500">{posts.length} 件</p>
          <div className="space-y-4">
            {posts.map((post) => (
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
    </div>
  )
}
