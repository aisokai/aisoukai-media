import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { isAdminAuthenticated } from '@/lib/adminAuth'
import { getAdminPost } from '@/lib/adminPosts'
import { NOINDEX_METADATA } from '@/lib/seo'
import PostMarkdownEditor from './PostMarkdownEditor'

export const metadata: Metadata = {
  title: 'Edit Post | Admin',
  ...NOINDEX_METADATA,
}

export const dynamic = 'force-dynamic'

type PageProps = {
  params: Promise<{ slug: string }>
}

export default async function EditPostPage({ params }: PageProps) {
  if (!(await isAdminAuthenticated())) redirect('/admin/login')

  const { slug } = await params
  const post = await getAdminPost(slug)
  if (!post) notFound()

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Link href="/admin/posts" className="inline-flex items-center gap-1 text-sm font-semibold text-gray-500 hover:text-gray-900">
        <ArrowLeft className="h-4 w-4" />
        記事管理へ戻る
      </Link>
      <div className="mb-5 mt-4">
        <h1 className="text-2xl font-bold text-gray-900">{post.title}</h1>
        <p className="mt-1 font-mono text-xs text-gray-500">{post.slug}</p>
      </div>
      <PostMarkdownEditor slug={post.slug} initialMarkdown={post.raw} />
    </main>
  )
}
