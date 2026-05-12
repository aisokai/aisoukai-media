'use client'
import { useState } from 'react'

type Props = {
  text: string
  label: string
  variant?: 'approve' | 'reject' | 'default'
}

export default function CopyButton({ text, label, variant = 'default' }: Props) {
  const [copied, setCopied] = useState(false)

  const handleClick = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard 非対応環境では無視（管理画面のみ使用）
    }
  }

  const base = 'inline-flex shrink-0 cursor-pointer items-center gap-1 rounded border px-3 py-1.5 text-xs font-semibold transition-colors'

  const colorMap = {
    approve: copied
      ? 'border-green-400 bg-green-500 text-white'
      : 'border-green-500 bg-green-600 text-white hover:bg-green-700',
    reject: copied
      ? 'border-gray-400 bg-gray-500 text-white'
      : 'border-gray-400 bg-gray-500 text-white hover:bg-gray-600',
    default: copied
      ? 'border-green-400 bg-green-100 text-green-700'
      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
  }

  return (
    <button type="button" onClick={handleClick} className={`${base} ${colorMap[variant]}`}>
      {copied ? '✓ コピー済み' : label}
    </button>
  )
}
