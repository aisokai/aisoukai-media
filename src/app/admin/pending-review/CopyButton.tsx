'use client'
import { useState } from 'react'

const STORAGE_KEY = 'reviewer_name'

type Props = {
  text: string
  label: string
  variant?: 'approve' | 'reject' | 'default'
}

export default function CopyButton({ text, label, variant = 'default' }: Props) {
  const [copied, setCopied] = useState(false)

  const handleClick = async () => {
    try {
      // approve コマンドの場合、localStorage の reviewer_name を差し込む
      let copyText = text
      if (variant === 'approve') {
        const reviewerName = localStorage.getItem(STORAGE_KEY)?.trim() ?? ''
        if (reviewerName) {
          // "氏名" をローカルストレージの名前に置換
          copyText = text.replace('"氏名"', `"${reviewerName}"`)
        }
        // 名前未設定の場合は "氏名" のまま（後で手入力を許容）
      }
      await navigator.clipboard.writeText(copyText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard 非対応環境では無視（管理画面のみ使用）
    }
  }

  const sizeClass = variant === 'approve' || variant === 'reject'
    ? 'w-full justify-center py-3 px-4 text-base rounded-xl'
    : 'px-3 py-1.5 text-xs rounded'

  const base = `inline-flex shrink-0 cursor-pointer items-center gap-1.5 border font-semibold transition-colors ${sizeClass}`

  const colorMap = {
    approve: copied
      ? 'border-green-400 bg-green-500 text-white'
      : 'border-green-500 bg-green-600 text-white hover:bg-green-700 active:bg-green-800',
    reject: copied
      ? 'border-gray-400 bg-gray-500 text-white'
      : 'border-gray-400 bg-gray-500 text-white hover:bg-gray-600 active:bg-gray-700',
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
