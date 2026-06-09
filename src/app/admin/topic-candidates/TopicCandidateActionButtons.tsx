'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateTopicCandidateStatusAction } from './actions'
import type { TopicCandidateStatus } from '@/lib/monthlyTopicCandidates'

const ACTIONS: Array<{ status: TopicCandidateStatus; label: string; className: string }> = [
  { status: 'selected', label: '今月採用', className: 'bg-blue-700 text-white hover:bg-blue-800' },
  { status: 'backup', label: '予備', className: 'bg-slate-700 text-white hover:bg-slate-800' },
  { status: 'hold', label: '保留', className: 'bg-amber-500 text-white hover:bg-amber-600' },
  { status: 'rejected', label: '却下', className: 'bg-red-600 text-white hover:bg-red-700' },
]

export default function TopicCandidateActionButtons({
  month,
  id,
}: {
  month: string
  id: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState('')
  const [note, setNote] = useState('')

  const updateStatus = (status: TopicCandidateStatus) => {
    startTransition(async () => {
      setMessage('')
      const result = await updateTopicCandidateStatusAction({
        month,
        id,
        status,
        reviewerNote: note,
      })
      setMessage(result.message)
      if (result.ok) router.refresh()
    })
  }

  return (
    <div className="mt-3 space-y-2">
      <input
        type="text"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="理由メモ（任意）"
        className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
      />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {ACTIONS.map((action) => (
          <button
            key={action.status}
            type="button"
            disabled={isPending}
            onClick={() => updateStatus(action.status)}
            className={`rounded-md px-3 py-2 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50 ${action.className}`}
          >
            {action.label}
          </button>
        ))}
      </div>
      {message && <p className="text-xs text-gray-500">{message}</p>}
    </div>
  )
}
