import Link from 'next/link';

export default function Header() {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 group">
          <span className="text-teal-600 text-lg font-bold tracking-tight group-hover:text-teal-700 transition-colors">
            愛走会メディア
          </span>
          <span className="text-xs text-slate-400 hidden sm:inline">
            歯科医療の最前線
          </span>
        </Link>
        <nav className="flex items-center gap-6 text-sm text-slate-600">
          <Link href="/" className="hover:text-teal-600 transition-colors">
            ホーム
          </Link>
          <Link href="/blog" className="hover:text-teal-600 transition-colors">
            記事一覧
          </Link>
        </nav>
      </div>
    </header>
  );
}
