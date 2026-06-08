"use client"

import Link from "next/link"
import Image from "next/image"
import { Search, Menu, X } from "lucide-react"
import { useState } from "react"

const navItems = [
  { name: "虫歯治療", href: "/category/cavity", color: "#3b82f6" },
  { name: "根管治療", href: "/category/root-canal", color: "#ef4444" },
  { name: "歯周病治療", href: "/category/periodontal", color: "#f97316" },
  { name: "予防歯科", href: "/category/preventive", color: "#22c55e" },
  { name: "小児歯科", href: "/category/pediatric", color: "#14b8a6" },
  { name: "親知らず", href: "/category/wisdom-tooth", color: "#ec4899" },
  { name: "インプラント", href: "/category/implant", color: "#0ea5e9" },
  { name: "その他", href: "/category/other", color: "#6b7280" },
  { name: "お知らせ", href: "/category/news", color: "#8b5cf6" },
]

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isSearchOpen, setIsSearchOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 w-full bg-white shadow-sm">
      {/* 上段バー: 運営者情報・お問い合わせ */}
      <div className="border-b border-gray-100 bg-gray-50">
        <div className="mx-auto flex h-8 max-w-[1100px] items-center justify-end gap-4 px-4">
          <Link href="/about" className="text-[11px] text-gray-500 hover:text-[#1e3a5f]">
            運営者情報
          </Link>
          <Link href="/contact" className="text-[11px] text-gray-500 hover:text-[#1e3a5f]">
            お問い合わせ
          </Link>
        </div>
      </div>

      {/* 中段: ロゴ行 */}
      <div className="border-b border-gray-100 bg-white">
        <div className="mx-auto flex h-[70px] max-w-[1100px] items-center justify-between px-4">
          {/* ロゴ左側 */}
          <Link href="/" className="flex items-center gap-3">
            <div className="relative h-11 w-11 overflow-hidden rounded-lg border border-gray-100 bg-white shadow-sm">
              <Image
                src="/images/clinic-logo.png"
                alt="三谷ファミリー歯科クリニックのロゴ"
                fill
                sizes="44px"
                className="object-contain p-1"
                priority
              />
            </div>
            <div className="flex flex-col">
              <span className="text-[18px] font-bold tracking-wide text-[#1e3a5f]">医療法人藍想会</span>
              <span className="text-[10px] tracking-wide text-gray-400">三谷ファミリー歯科クリニック ブログサイト</span>
            </div>
          </Link>

          {/* 右側: 検索・ハンバーガー */}
          <div className="flex items-center gap-2">
            {/* デスクトップ用検索ボタン */}
            <button
              onClick={() => setIsSearchOpen(!isSearchOpen)}
              className="hidden h-10 w-10 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 md:flex"
              aria-label="検索を開く"
            >
              <Search className="h-5 w-5" />
            </button>

            {/* モバイル用ハンバーガーボタン */}
            <button
              className="flex h-10 w-10 items-center justify-center rounded-md text-gray-700 md:hidden"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              aria-label={isMenuOpen ? "メニューを閉じる" : "メニューを開く"}
            >
              {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* 下段（デスクトップのみ）: ナビゲーション pills */}
      <div className="hidden border-b border-gray-100 bg-gray-50/50 md:block">
        <div className="mx-auto max-w-[1100px] px-4">
          <nav className="flex items-center justify-center gap-1.5 py-2">
            {navItems.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                // ホバー時に各カラー背景 + 白文字になるよう group を使用
                className="group relative overflow-hidden rounded-full border border-gray-200 bg-white px-3 py-1.5 text-[12px] font-medium text-gray-600 shadow-sm transition-all duration-200 hover:border-transparent hover:text-white hover:shadow-md"
              >
                {/* ホバー時に表示するカラー背景レイヤー */}
                <span
                  className="absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                  style={{ backgroundColor: item.color }}
                />
                <span className="relative z-10 flex items-center gap-1.5">
                  {/* カテゴリカラーのドット */}
                  <span
                    className="h-1.5 w-1.5 rounded-full transition-colors duration-200 group-hover:bg-white"
                    style={{ backgroundColor: item.color }}
                  />
                  {item.name}
                </span>
              </Link>
            ))}
          </nav>
        </div>
      </div>

      {/* 検索バー (isSearchOpen=true のとき表示) */}
      {isSearchOpen && (
        <div className="border-b border-gray-100 bg-white py-4">
          <div className="mx-auto max-w-[1100px] px-4">
            <div className="relative mx-auto max-w-xl">
              <input
                type="text"
                placeholder="キーワードを入力してください"
                className="w-full rounded-full border border-gray-200 bg-gray-50 px-5 py-3 pr-12 text-sm placeholder:text-gray-400 focus:border-[#1e3a5f] focus:bg-white focus:outline-none"
              />
              <button
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#1e3a5f]"
                aria-label="検索"
              >
                <Search className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* モバイルメニュー (isMenuOpen=true のとき表示) */}
      {isMenuOpen && (
        <div className="border-b border-gray-100 bg-white px-4 py-4 md:hidden">
          {/* navItems を縦並びで表示 */}
          <nav className="flex flex-col gap-1">
            {navItems.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className="flex items-center gap-3 rounded-lg px-4 py-3 text-[14px] font-medium text-gray-700 transition-colors hover:bg-gray-50"
                onClick={() => setIsMenuOpen(false)}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                {item.name}
              </Link>
            ))}
          </nav>
          {/* モバイル用検索 input */}
          <div className="mt-4 border-t border-gray-100 pt-4">
            <input
              type="text"
              placeholder="キーワードを入力"
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm placeholder:text-gray-400 focus:border-[#1e3a5f] focus:outline-none"
            />
          </div>
        </div>
      )}
    </header>
  )
}
