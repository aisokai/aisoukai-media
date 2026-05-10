import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getAllPosts, getPostBySlug } from '@/lib/posts';

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  return getAllPosts().map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
  if (!post) return {};
  return { title: post.title, description: post.description };
}

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
  if (!post) notFound();

  const formattedDate = new Date(post.date).toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      <nav aria-label="パンくずリスト" className="text-xs text-gray-400 mb-10 flex items-center gap-2 flex-wrap">
        <Link href="/" className="hover:text-blue-600 transition-colors">ホーム</Link>
        <span>/</span>
        <Link href="/blog" className="hover:text-blue-600 transition-colors">記事一覧</Link>
        <span>/</span>
        <span className="text-gray-500 truncate max-w-[220px]">{post.title}</span>
      </nav>

      <div className="max-w-2xl">
        <header className="mb-10">
          <div className="flex items-center gap-3 mb-5">
            <span className="text-xs font-medium text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full">
              {post.category}
            </span>
            <time className="text-xs text-gray-400">{formattedDate}</time>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight mb-5">
            {post.title}
          </h1>
          <p className="text-gray-500 leading-relaxed border-l-2 border-blue-200 pl-4">
            {post.description}
          </p>
          {post.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-5">
              {post.tags.map((tag) => (
                <span
                  key={tag}
                  className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </header>

        <hr className="border-gray-200 mb-10" />

        {/* contentHtml は remark-html({ sanitize: true }) で処理済みの信頼済みHTML */}
        {/* eslint-disable-next-line react/no-danger */}
        <div className="prose" dangerouslySetInnerHTML={{ __html: post.contentHtml }} />

        <hr className="border-gray-200 mt-14 mb-8" />

        <Link
          href="/blog"
          className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors"
        >
          ← 記事一覧に戻る
        </Link>
      </div>
    </div>
  );
}
