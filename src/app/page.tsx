import Link from 'next/link';
import { getAllPosts } from '@/lib/posts';
import ArticleCard from '@/components/ArticleCard';

export default function HomePage() {
  const recentPosts = getAllPosts().slice(0, 3);

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <section className="mb-14 text-center">
        <p className="text-xs font-medium text-teal-600 tracking-widest uppercase mb-3">
          Dental Media
        </p>
        <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 leading-tight mb-4">
          歯科医療の最新情報を、
          <br className="hidden sm:block" />
          わかりやすくお届けします
        </h1>
        <p className="text-slate-500 text-sm sm:text-base leading-relaxed max-w-xl mx-auto">
          AI技術・歯科治療・口腔健康に関するコンテンツを専門家監修のもと発信する歯科メディアです。
        </p>
      </section>

      {recentPosts.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-slate-900">最新記事</h2>
            <Link
              href="/blog"
              className="text-sm text-teal-600 hover:text-teal-700 transition-colors"
            >
              すべて見る →
            </Link>
          </div>
          <div className="space-y-4">
            {recentPosts.map((post) => (
              <ArticleCard key={post.slug} post={post} />
            ))}
          </div>
        </section>
      )}

      {recentPosts.length === 0 && (
        <section className="text-center py-16 text-slate-400">
          <p>記事を準備中です。しばらくお待ちください。</p>
        </section>
      )}
    </div>
  );
}
