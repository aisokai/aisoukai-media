export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-slate-200 bg-white mt-auto">
      <div className="max-w-3xl mx-auto px-4 py-6 text-center text-xs text-slate-400">
        <p>© {year} 愛走会メディア. All rights reserved.</p>
        <p className="mt-1">歯科医療・AI技術の最新情報をお届けします</p>
      </div>
    </footer>
  );
}
