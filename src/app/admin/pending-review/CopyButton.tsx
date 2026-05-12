'use client'
import { useState } from 'react'

export default function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)

  const handleClick = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard 非対応環境ではフォールバックしない（管理画面のみ使用）
    }
  }

  return (
    <button
      onClick={handleClick}
      className={`shrink-0 rounded px-2 py-1 text-xs font-medium transition-colors ${
        copied
          ? 'bg-green-100 text-green-700'
          : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
      }`}
    >
      {copied ? '✓ Copied' : label}
    </button>
  )
}
