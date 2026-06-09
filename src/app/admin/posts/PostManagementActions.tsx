'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { archivePostAction, deletePostAction, restorePostAction } from './actions'

export default function PostManagementActions({
  slug,
  archived,
}: {
  slug: string
  archived: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState('')
  const [reason, setReason] = useState('')
  const [confirmation, setConfirmation] = useState('')

  const runArchive = () => {
    startTransition(async () => {
      setMessage('')
      const result = archived
        ? await restorePostAction(slug, reason)
        : await archivePostAction(slug, reason)
      setMessage(result.message)
      if (result.ok) {
        setReason('')
        router.refresh()
      }
    })
  }

  const runDelete = () => {
    const ok = window.confirm(`記事 ${slug} を物理削除します。通常はアーカイブ推奨です。本当に削除しますか？`)
    if (!ok) return
    startTransition(async () => {
      setMessage('')
      const result = await deletePostAction(slug, confirmation)
      setMessage(result.message)
      if (result.ok) router.refresh()
    })
  }

  return (
    <div className="mt-3 space-y-2 rounded-md bg-gray-50 p-3">
      <input
        type="text"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder={archived ? '復帰理由' : 'アーカイブ理由'}
        className="w-full rounded-md border border-gray-200 px-3 py-2 text-xs"
      />
      <button
        type="button"
        disabled={isPending}
        onClick={runArchive}
        className={`w-full rounded-md px-3 py-2 text-xs font-bold text-white disabled:opacity-50 ${
          archived ? 'bg-emerald-700 hover:bg-emerald-800' : 'bg-slate-700 hover:bg-slate-800'
        }`}
      >
        {archived ? 'アーカイブから復帰' : 'アーカイブ'}
      </button>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <input
          type="text"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          placeholder="削除する場合は slug を入力"
          className="w-full rounded-md border border-red-200 px-3 py-2 text-xs"
        />
        <button
          type="button"
          disabled={isPending}
          onClick={runDelete}
          className="rounded-md bg-red-600 px-3 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
        >
          物理削除
        </button>
      </div>
      {message && <p className="text-xs font-semibold text-gray-600">{message}</p>}
    </div>
  )
}
