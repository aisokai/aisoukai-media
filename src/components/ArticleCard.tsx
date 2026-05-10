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
    <article className="bg-white rounded-lg border border-slate-200 p-6 hover:border-teal-300 hover:shadow-sm transition-all">
      <Link href={`/blog/${post.slug}`} className="block group">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs font-medium text-teal-600 bg-teal-50 px-2 py-0.5 rounded">
            {post.category}
          </span>
          <time className="text-xs text-slate-400">{formattedDate}</time>
        </div>
        <h2 className="text-base font-semibold text-slate-900 leading-snug group-hover:text-teal-700 transition-colors mb-2">
          {post.title}
        </h2>
        <p className="text-sm text-slate-500 leading-relaxed line-clamp-2">
          {post.description}
        </p>
        <div className="flex flex-wrap gap-1.5 mt-4">
          {post.tags.map((tag) => (
            <span
              key={tag}
              className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded"
            >
              #{tag}
            </span>
          ))}
        </div>
      </Link>
    </article>
  );
}
