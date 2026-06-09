'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateArticleTopicAction } from './actions'

const STATUSES = ['idea', 'approved', 'drafting', 'reviewed', 'published', 'hold']
const PRIORITIES = ['low', 'medium', 'high']
const RISKS = ['low', 'medium', 'high']
const CATEGORIES = ['虫歯治療', '根管治療', '歯周病治療', '予防歯科', '小児歯科', '親知らず', 'インプラント', 'その他', 'お知らせ']

export default function ArticleTopicEditControls({
  id,
  initialStatus,
  initialTitleCandidate,
  initialCategory,
  initialTargetKeyword,
  initialPatientIntent,
  initialPriority,
  initialMedicalRisk,
  initialPublishDate,
  initialNotes,
}: {
  id: string
  initialStatus: string
  initialTitleCandidate: string
  initialCategory: string
  initialTargetKeyword: string
  initialPatientIntent: string
  initialPriority: string
  initialMedicalRisk: string
  initialPublishDate: string
  initialNotes: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [status, setStatus] = useState(initialStatus || 'idea')
  const [titleCandidate, setTitleCandidate] = useState(initialTitleCandidate)
  const [category, setCategory] = useState(initialCategory)
  const [targetKeyword, setTargetKeyword] = useState(initialTargetKeyword)
  const [patientIntent, setPatientIntent] = useState(initialPatientIntent)
  const [priority, setPriority] = useState(initialPriority || 'medium')
  const [medicalRisk, setMedicalRisk] = useState(initialMedicalRisk || 'medium')
  const [publishDate, setPublishDate] = useState(initialPublishDate)
  const [notes, setNotes] = useState(initialNotes)
  const [message, setMessage] = useState('')

  const save = () => {
    startTransition(async () => {
      setMessage('')
      const result = await updateArticleTopicAction({
        id,
        status,
        titleCandidate,
        category,
        targetKeyword,
        patientIntent,
        priority,
        medicalRisk,
        publishDate,
        notes,
      })
      setMessage(result.message)
      if (result.ok) router.refresh()
    })
  }

  return (
    <details className="min-w-[520px] rounded-md bg-gray-50 p-2">
      <summary className="cursor-pointer text-xs font-bold text-gray-700">編集</summary>
      <div className="mt-2 grid gap-2">
        <input
          type="text"
          value={titleCandidate}
          onChange={(event) => setTitleCandidate(event.target.value)}
          className="rounded-md border border-gray-200 px-2 py-2 text-xs"
          placeholder="title_candidate"
        />
        <div className="grid gap-2 md:grid-cols-3">
          <select value={category} onChange={(event) => setCategory(event.target.value)} className="rounded-md border border-gray-200 px-2 py-2 text-xs">
            {CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select value={priority} onChange={(event) => setPriority(event.target.value)} className="rounded-md border border-gray-200 px-2 py-2 text-xs">
            {PRIORITIES.map((item) => <option key={item} value={item}>priority: {item}</option>)}
          </select>
          <select value={medicalRisk} onChange={(event) => setMedicalRisk(event.target.value)} className="rounded-md border border-gray-200 px-2 py-2 text-xs">
            {RISKS.map((item) => <option key={item} value={item}>risk: {item}</option>)}
          </select>
        </div>
        <input
          type="text"
          value={targetKeyword}
          onChange={(event) => setTargetKeyword(event.target.value)}
          className="rounded-md border border-gray-200 px-2 py-2 text-xs"
          placeholder="target_keyword"
        />
        <input
          type="text"
          value={patientIntent}
          onChange={(event) => setPatientIntent(event.target.value)}
          className="rounded-md border border-gray-200 px-2 py-2 text-xs"
          placeholder="patient_intent"
        />
        <div className="grid gap-2 md:grid-cols-[120px_130px_1fr_auto]">
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="rounded-md border border-gray-200 px-2 py-2 text-xs"
          >
            {STATUSES.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
      <input
        type="date"
        value={publishDate}
        onChange={(event) => setPublishDate(event.target.value)}
        className="rounded-md border border-gray-200 px-2 py-2 text-xs"
      />
      <input
        type="text"
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        className="rounded-md border border-gray-200 px-2 py-2 text-xs"
        placeholder="notes"
      />
      <button
        type="button"
        disabled={isPending}
        onClick={save}
        className="rounded-md bg-blue-700 px-3 py-2 text-xs font-bold text-white hover:bg-blue-800 disabled:opacity-50"
      >
        保存
      </button>
        </div>
        {message && <p className="text-xs font-semibold text-gray-500">{message}</p>}
      </div>
    </details>
  )
}
