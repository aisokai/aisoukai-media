'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { finalizeSelectedTopicCandidatesAction } from './actions'

export default function FinalizeTopicCandidatesButton({
  month,
  selectedCount,
  targetPostCount,
}: {
  month: string
  selectedCount: number
  targetPostCount: number
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState('')
  const disabled = isPending || selectedCount === 0 || selectedCount > targetPostCount

  const finalize = () => {
    const ok = window.confirm(
      `${month} の今月採用 ${selectedCount} 件を記事ネタCSVへ追加します。記事本文はまだ生成されません。実行しますか？`,
    )
    if (!ok) return

    startTransition(async () => {
      setMessage('')
      const result = await finalizeSelectedTopicCandidatesAction(month)
      setMessage(result.message)
      if (result.ok) router.refresh()
    })
  }

  return (
    <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-blue-950">採用候補を確定</p>
          <p className="mt-1 text-xs text-blue-800">
            今月採用を記事ネタCSVへ追加します。下書き生成・公開はまだ行いません。
          </p>
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={finalize}
          className="rounded-md bg-blue-700 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-blue-200 disabled:text-blue-500"
        >
          {isPending ? '確定中...' : '採用を確定する'}
        </button>
      </div>
      {selectedCount === 0 && (
        <p className="mt-2 text-xs font-semibold text-blue-700">先に候補を「今月採用」にしてください。</p>
      )}
      {selectedCount > targetPostCount && (
        <p className="mt-2 text-xs font-semibold text-red-700">
          今月採用が上限を超えています。{targetPostCount} 件以内にしてください。
        </p>
      )}
      {message && <p className="mt-2 text-xs font-semibold text-blue-900">{message}</p>}
    </div>
  )
}
