'use client'

import { useState, useTransition } from 'react'
import { approvePostAction, rejectPostAction, type ReviewActionResult } from './actions'

const STORAGE_KEY = 'reviewer_name'

function getStoredReviewerName() {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem(STORAGE_KEY)?.trim() ?? ''
}

type Props = {
  slug: string
  title: string
}

export default function ReviewActionButtons({ slug, title }: Props) {
  const [reviewerName, setReviewerName] = useState(getStoredReviewerName)
  const [reason, setReason] = useState('')
  const [result, setResult] = useState<ReviewActionResult | null>(null)
  const [isPending, startTransition] = useTransition()

  function saveReviewerName(value: string) {
    setReviewerName(value)
    localStorage.setItem(STORAGE_KEY, value)
  }

  function approve() {
    setResult(null)
    if (!reviewerName.trim()) {
      setResult({ ok: false, message: '承認者名を入力してください' })
      return
    }
    if (!window.confirm(`この記事を承認しますか？\n\n${title}`)) return

    startTransition(async () => {
      const next = await approvePostAction({ slug, reviewedBy: reviewerName })
      setResult(next)
    })
  }

  function reject() {
    setResult(null)
    if (!reviewerName.trim()) {
      setResult({ ok: false, message: '承認者名を入力してください' })
      return
    }
    if (!reason.trim()) {
      setResult({ ok: false, message: '却下理由を入力してください' })
      return
    }
    if (!window.confirm(`この記事を却下しますか？\n\n${title}`)) return

    startTransition(async () => {
      const next = await rejectPostAction({ slug, reviewedBy: reviewerName, reason })
      setResult(next)
    })
  }

  return (
    <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 p-3">
      <label className="block text-xs font-bold text-slate-600">
        承認者名
        <input
          value={reviewerName}
          onChange={(event) => saveReviewerName(event.target.value)}
          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-base font-semibold text-slate-800 focus:border-[#1e3a5f] focus:outline-none"
          placeholder="例: 三谷"
        />
      </label>

      <div className="mt-3 grid gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={approve}
          className="min-h-12 w-full rounded-xl bg-green-600 px-4 py-3 text-base font-bold text-white shadow-sm transition hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {isPending ? '処理中...' : '承認する'}
        </button>

        <details className="rounded-xl border border-slate-200 bg-white p-3">
          <summary className="cursor-pointer select-none text-sm font-bold text-slate-700">
            却下する
          </summary>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="mt-3 min-h-24 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-[#1e3a5f] focus:outline-none"
            placeholder="却下理由を入力"
          />
          <button
            type="button"
            disabled={isPending}
            onClick={reject}
            className="mt-2 min-h-11 w-full rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            却下を確定
          </button>
        </details>
      </div>

      {result && (
        <p
          className={`mt-3 rounded-xl px-3 py-2 text-sm font-semibold ${
            result.ok ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
          }`}
        >
          {result.message}
        </p>
      )}
    </div>
  )
}
