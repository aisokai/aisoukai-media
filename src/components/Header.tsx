import Link from 'next/link';

export default function Header() {
  return (
    <header className="bg-white border-b border-gray-200">
      <div className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between">
        <Link href="/" className="group flex flex-col gap-0.5">
          <span className="text-xl font-bold text-gray-900 tracking-tight leading-none group-hover:text-blue-700 transition-colors">
            藍想会メディア
          </span>
          <span className="text-xs text-gray-400 tracking-wide">
            歯科医療をわかりやすく
          </span>
        </Link>
        <nav aria-label="メインナビゲーション" className="flex items-center gap-8 text-sm text-gray-600">
          <Link href="/" className="hover:text-blue-700 transition-colors">
            ホーム
          </Link>
          <Link href="/blog" className="hover:text-blue-700 transition-colors">
            記事一覧
          </Link>
        </nav>
      </div>
    </header>
  );
}
