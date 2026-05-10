import Link from 'next/link';
import type { PostMeta } from '@/lib/posts';

type Props = {
  post: PostMeta;
};

export default function ArticleCard({ post }: Props) {
  const formattedDate = new Date(post.date).toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <article className="group bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md hover:border-blue-200 transition-all duration-200">
      <Link href={`/blog/${post.slug}`} className="block p-6">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-xs font-medium text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full">
            {post.category}
          </span>
          <time className="text-xs text-gray-400">{formattedDate}</time>
        </div>
        <h2 className="text-base font-semibold text-gray-900 leading-snug group-hover:text-blue-700 transition-colors mb-3">
          {post.title}
        </h2>
        <p className="text-sm text-gray-500 leading-relaxed line-clamp-2 mb-5">
          {post.description}
        </p>
        <div className="flex items-end justify-between gap-4">
          <div className="flex flex-wrap gap-1.5">
            {post.tags.map((tag) => (
              <span
                key={tag}
                className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded"
              >
                #{tag}
              </span>
            ))}
          </div>
          <span className="shrink-0 text-xs text-blue-600 font-medium group-hover:translate-x-0.5 transition-transform inline-block">
            読む →
          </span>
        </div>
      </Link>
    </article>
  );
}
