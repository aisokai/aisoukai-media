'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { deleteRejectedPostAction } from '../posts/actions'

export default function RejectedPostDeleteButton({
  slug,
}: {
  slug: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState('')

  const runDelete = () => {
    const ok = window.confirm(`差し戻し済み記事 ${slug} を物理削除します。本当に削除しますか？`)
    if (!ok) return
    startTransition(async () => {
      setMessage('')
      const result = await deleteRejectedPostAction(slug)
      setMessage(result.message)
      if (result.ok) router.refresh()
    })
  }

  return (
    <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3">
      <button
        type="button"
        disabled={isPending}
        onClick={runDelete}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-red-700 px-3 py-2 text-xs font-bold text-white hover:bg-red-800 disabled:opacity-50"
      >
        <Trash2 className="h-3.5 w-3.5" />
        差し戻し記事を削除
      </button>
      {message && <p className="mt-2 text-xs font-semibold text-red-800">{message}</p>}
    </div>
  )
}
