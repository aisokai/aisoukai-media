'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import type { MonthlyTopicCandidate, TopicCandidateStatus } from '@/lib/monthlyTopicCandidates'
import TopicCandidateActionButtons from './TopicCandidateActionButtons'

const LABELS = { pending: '未判断', selected: '今月採用', backup: '予備', hold: '保留', rejected: '却下' }

export default function TopicCandidateCard({ month, topic, children }: { month: string; topic: MonthlyTopicCandidate; children: ReactNode }) {
  const [savedStatus, setSavedStatus] = useState<TopicCandidateStatus | null>(null)
  const feedback = useRef<HTMLParagraphElement>(null)
  useEffect(() => { if (savedStatus) feedback.current?.focus() }, [savedStatus])
  if (savedStatus) return (
    <p ref={feedback} tabIndex={-1} role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-900">
      「{LABELS[savedStatus]}」に保存しました。
      <Link href={`/admin/topic-candidates?month=${month}&status=${savedStatus}`} className="ml-2 underline">保存した候補を確認</Link>
    </p>
  )
  return (
    <article className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-bold text-gray-700">{LABELS[topic.status]}</span>
      {children}
      <TopicCandidateActionButtons month={month} id={topic.id} currentStatus={topic.status} onSaved={setSavedStatus} />
    </article>
  )
}
