import type { Metadata } from 'next'
import Image from 'next/image'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { Clock, Tag } from 'lucide-react'
import {
  getCandidateOneLocalPreview,
  isCandidateOneLocalPreviewAllowed,
} from '@/lib/candidateOneLocalPreview'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: '記事プレビュー',
  robots: { index: false, follow: false },
}

export default async function CandidateOneLocalPreviewPage() {
  const requestHeaders = await headers()
  if (!isCandidateOneLocalPreviewAllowed({
    host: requestHeaders.get('host'),
    nodeEnv: process.env.NODE_ENV,
  })) {
    notFound()
  }

  const post = await getCandidateOneLocalPreview()

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 md:py-12">
      <article className="overflow-hidden rounded-lg bg-white shadow-sm">
        <div className="h-2 w-full bg-[#22c55e]" />
        <div className="p-6 md:p-10">
          <div className="mb-4 flex flex-wrap items-center gap-3 text-[12px] text-gray-400">
            {post.category && (
              <span className="rounded bg-[#22c55e] px-2 py-0.5 text-[11px] font-bold text-white">
                {post.category}
              </span>
            )}
            {post.date && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {post.date}
              </span>
            )}
          </div>

          <h1 className="mb-4 text-[26px] font-bold leading-snug text-gray-900 md:text-[34px]">
            {post.title}
          </h1>

          {post.image && (
            <div className="relative mb-6 aspect-[16/9] overflow-hidden rounded-lg bg-gray-100">
              <Image
                src={post.image}
                alt={post.imageAlt || post.title}
                fill
                className="object-cover"
                priority
              />
            </div>
          )}

          {post.excerpt && (
            <div className="mb-6 border-l-4 border-[#1e3a5f] bg-blue-50 p-4">
              <p className="text-[15px] leading-relaxed text-gray-700">{post.excerpt}</p>
            </div>
          )}

          {post.tags.length > 0 && (
            <div className="mb-7 flex flex-wrap items-center gap-2">
              <Tag className="h-3.5 w-3.5 text-gray-400" />
              {post.tags.map((tag) => (
                <span key={tag} className="rounded-full bg-gray-100 px-3 py-0.5 text-[12px] text-gray-600">
                  {tag}
                </span>
              ))}
            </div>
          )}

          <div
            className="prose max-w-none"
            dangerouslySetInnerHTML={{ __html: post.contentHtml }}
          />
        </div>
      </article>
    </main>
  )
}
