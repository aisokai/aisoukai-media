import type { Metadata } from 'next';
import { getAllPosts } from '@/lib/posts';
import ArticleCard from '@/components/ArticleCard';

export const metadata: Metadata = {
  title: '記事一覧',
  description: '歯科医療・AI技術に関する最新記事の一覧です。',
};

export default function BlogPage() {
  const posts = getAllPosts();

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <div className="mb-10">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">記事一覧</h1>
        <p className="text-sm text-slate-400">{posts.length}件の記事</p>
      </div>

      {posts.length > 0 ? (
        <div className="space-y-4">
          {posts.map((post) => (
            <ArticleCard key={post.slug} post={post} />
          ))}
        </div>
      ) : (
        <div className="text-center py-16 text-slate-400">
          <p>記事を準備中です。しばらくお待ちください。</p>
        </div>
      )}
    </div>
  );
}
