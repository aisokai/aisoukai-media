import Link from 'next/link';

export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="bg-gray-50 border-t border-gray-200 mt-auto">
      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="flex flex-col sm:flex-row justify-between gap-8 mb-10">
          <div>
            <p className="text-base font-bold text-gray-900 mb-2">藍想会メディア</p>
            <p className="text-sm text-gray-500 leading-relaxed max-w-xs">
              お口の健康、予防、訪問歯科、医院からのお知らせを
              <br className="hidden sm:block" />
              わかりやすくお届けします。
            </p>
          </div>
          <nav aria-label="フッターナビゲーション" className="flex flex-col gap-2 text-sm text-gray-500">
            <Link href="/" className="hover:text-blue-700 transition-colors">ホーム</Link>
            <Link href="/blog" className="hover:text-blue-700 transition-colors">記事一覧</Link>
          </nav>
        </div>
        <div className="pt-6 border-t border-gray-200 text-center text-xs text-gray-400">
          <p>© {year} 藍想会メディア. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
