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
  const disabled = isPending || selectedCount === 0

  const finalize = () => {
    const ok = window.confirm(
      `${month} の今月採用 ${selectedCount} 件を採用として確定します。CSVにある候補も現在の内容で採用を確認し、欠落・旧版の採用記録を作成・更新します。記事本文はまだ生成されません。実行しますか？`,
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
          <p className="text-sm font-bold text-blue-950">過去の採用記録を確認（必要な場合のみ）</p>
          <p className="mt-1 text-xs text-blue-800">
            通常は「今月採用」だけで完了します。以前に選択した候補が生成対象にならない場合、この月の採用内容をまとめて再確認できます。
          </p>
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={finalize}
          className="rounded-md bg-blue-700 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-blue-200 disabled:text-blue-500"
        >
          {isPending ? '確定中...' : '過去の採用を再確認する'}
        </button>
      </div>
      {selectedCount === 0 && (
        <p className="mt-2 text-xs font-semibold text-blue-700">先に候補を「今月採用」にしてください。</p>
      )}
      {selectedCount > targetPostCount && (
        <p className="mt-2 text-xs font-semibold text-red-700">
          月次目標 {targetPostCount} 件を超えています。採用は続けられます。過去の採用は自動では取り消しません。
        </p>
      )}
      {message && <p className="mt-2 text-xs font-semibold text-blue-900">{message}</p>}
    </div>
  )
}
