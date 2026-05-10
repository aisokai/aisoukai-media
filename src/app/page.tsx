import Link from 'next/link';
import { getAllPosts } from '@/lib/posts';
import { ArticleCard } from '@/components/ArticleCard';

const CATEGORIES = [
  { name: '予防歯科', desc: 'むし歯・歯周病の予防と定期ケア' },
  { name: '訪問歯科', desc: 'ご自宅・施設での歯科治療' },
  { name: '小児歯科', desc: 'お子さまの口腔発育とケア' },
  { name: '医院からのお知らせ', desc: '休診日・新しい取り組み' },
] as const;

export default function HomePage() {
  const recentPosts = getAllPosts().slice(0, 3);

  return (
    <div>
      {/* Hero */}
      <section className="bg-gradient-to-b from-blue-50 to-white">
        <div className="max-w-5xl mx-auto px-6 py-20 sm:py-28">
          <p className="text-xs font-semibold tracking-[0.2em] text-blue-600 uppercase mb-5">
            Dental Media
          </p>
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 leading-tight tracking-tight mb-5">
            藍想会メディア
          </h1>
          <p className="text-xl sm:text-2xl font-medium text-gray-600 mb-4">
            歯科医療を、もっとわかりやすく。
          </p>
          <p className="text-base text-gray-500 leading-relaxed max-w-lg mb-10">
            お口の健康、予防、訪問歯科、医院からのお知らせを、わかりやすくお届けします。
          </p>
          <Link
            href="/blog"
            className="inline-flex items-center gap-2 bg-blue-700 text-white text-sm font-semibold px-6 py-3 rounded-lg hover:bg-blue-800 transition-colors"
          >
            記事を読む
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>

      {/* Categories */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <h2 className="text-lg font-semibold text-gray-900 mb-6">カテゴリから探す</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {CATEGORIES.map((cat) => (
            <div
              key={cat.name}
              className="bg-white border border-gray-200 rounded-xl p-5 hover:border-blue-300 hover:shadow-sm transition-all"
            >
              <p className="text-sm font-semibold text-gray-900 mb-1">{cat.name}</p>
              <p className="text-xs text-gray-400 leading-relaxed">{cat.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Recent posts */}
      {recentPosts.length > 0 && (
        <section className="max-w-5xl mx-auto px-6 pb-24">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-900">最新記事</h2>
            <Link
              href="/blog"
              className="text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors"
            >
              すべて見る →
            </Link>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {recentPosts.map((post) => (
              <ArticleCard key={post.slug} {...post} />
            ))}
          </div>
        </section>
      )}

      {recentPosts.length === 0 && (
        <section className="max-w-5xl mx-auto px-6 pb-24 text-center py-16 text-gray-400">
          <p>記事を準備中です。しばらくお待ちください。</p>
        </section>
      )}
    </div>
  );
}
