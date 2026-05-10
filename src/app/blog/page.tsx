import type { Metadata } from 'next';
import { getAllPosts } from '@/lib/posts';
import { ArticleCard } from '@/components/ArticleCard';

export const metadata: Metadata = {
  title: '記事一覧',
  description: '歯科医療・予防・訪問歯科・医院情報に関する最新記事の一覧です。',
};

export default function BlogPage() {
  const posts = getAllPosts();

  return (
    <div className="max-w-5xl mx-auto px-6 py-14">
      <header className="mb-12">
        <p className="text-xs font-semibold tracking-[0.15em] text-blue-600 uppercase mb-2">
          Articles
        </p>
        <h1 className="text-3xl font-bold text-gray-900">記事一覧</h1>
        <p className="text-sm text-gray-400 mt-2">{posts.length}件の記事</p>
      </header>

      {posts.length > 0 ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {posts.map((post) => (
            <ArticleCard key={post.slug} {...post} />
          ))}
        </div>
      ) : (
        <div className="text-center py-24 text-gray-400">
          <p>記事を準備中です。しばらくお待ちください。</p>
        </div>
      )}
    </div>
  );
}
