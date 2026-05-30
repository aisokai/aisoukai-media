'use client'

import { useEffect, useState } from 'react'

const STORAGE_KEY = 'reviewer_name'

export default function ReviewerNameClient() {
  const [name, setName] = useState('')
  const [editing, setEditing] = useState(false)
  const [input, setInput] = useState('')

  // localStorage から読み込み
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) ?? ''
    setName(saved)
    setInput(saved)
    if (!saved) setEditing(true) // 未設定なら即編集モード
  }, [])

  const save = () => {
    const trimmed = input.trim()
    localStorage.setItem(STORAGE_KEY, trimmed)
    setName(trimmed)
    setEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') save()
    if (e.key === 'Escape') {
      setInput(name)
      setEditing(false)
    }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-gray-500">承認者:</span>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="名前を入力（例: 三谷）"
          autoFocus
          className="rounded border border-blue-300 px-2 py-1 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <button
          type="button"
          onClick={save}
          className="rounded bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700"
        >
          保存
        </button>
        {name && (
          <button
            type="button"
            onClick={() => { setInput(name); setEditing(false) }}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            キャンセル
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs font-semibold text-gray-500">承認者:</span>
      <span className="text-sm font-semibold text-gray-800">{name || '未設定'}</span>
      <button
        type="button"
        onClick={() => { setInput(name); setEditing(true) }}
        className="text-sm text-gray-400 hover:text-gray-600"
        aria-label="承認者名を編集"
      >
        ✏️
      </button>
      <span className="ml-1 text-[10px] text-gray-400">（コピー時に自動反映）</span>
    </div>
  )
}
