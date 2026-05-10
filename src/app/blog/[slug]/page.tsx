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
    <div className="max-w-3xl mx-auto px-4 py-12">
      <nav className="text-xs text-slate-400 mb-8 flex items-center gap-2">
        <Link href="/" className="hover:text-teal-600 transition-colors">ホーム</Link>
        <span>/</span>
        <Link href="/blog" className="hover:text-teal-600 transition-colors">記事一覧</Link>
        <span>/</span>
        <span className="text-slate-500 truncate">{post.title}</span>
      </nav>

      <header className="mb-10">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs font-medium text-teal-600 bg-teal-50 px-2 py-0.5 rounded">
            {post.category}
          </span>
          <time className="text-xs text-slate-400">{formattedDate}</time>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 leading-tight mb-4">
          {post.title}
        </h1>
        <p className="text-slate-500 leading-relaxed">{post.description}</p>
        <div className="flex flex-wrap gap-1.5 mt-4">
          {post.tags.map((tag) => (
            <span key={tag} className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
              #{tag}
            </span>
          ))}
        </div>
      </header>

      {/*
        XSS 対策済み: contentHtml は getPostBySlug() 内で
        remark-html({ sanitize: true }) を通した後にのみ生成される。
        content/posts/ ディレクトリは管理者のみ編集可能であり、
        外部ユーザー入力を直接レンダリングしているわけではない。
      */}
      {/* eslint-disable-next-line react/no-danger */}
      <div className="prose" dangerouslySetInnerHTML={{ __html: post.contentHtml }} />

      <div className="mt-12 pt-8 border-t border-slate-200">
        <Link href="/blog" className="text-sm text-teal-600 hover:text-teal-700 transition-colors">
          ← 記事一覧に戻る
        </Link>
      </div>
    </div>
  );
}
