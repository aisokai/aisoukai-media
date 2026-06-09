import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { isAdminAuthenticated } from '@/lib/adminAuth'
import { NOINDEX_METADATA } from '@/lib/seo'
import {
  type MonthlyTopicCandidate,
  buildTopicCandidateSummary,
  getDefaultTopicCandidateMonth,
  getMonthlyTopicCandidatesForAdmin,
} from '@/lib/monthlyTopicCandidates'
import FinalizeTopicCandidatesButton from './FinalizeTopicCandidatesButton'
import TopicCandidateActionButtons from './TopicCandidateActionButtons'

export const metadata: Metadata = {
  title: 'Topic Candidates | Admin',
  ...NOINDEX_METADATA,
}

export const dynamic = 'force-dynamic'

type PageProps = {
  searchParams?: Promise<{
    month?: string
    status?: string
    risk?: string
    duplicate?: string
    priority?: string
    sort?: string
  }>
}

const STATUS_LABELS = {
  pending: '未判断',
  selected: '今月採用',
  backup: '予備',
  hold: '保留',
  rejected: '却下',
}

const STATUS_STYLES = {
  pending: 'bg-gray-100 text-gray-700',
  selected: 'bg-blue-100 text-blue-800',
  backup: 'bg-slate-100 text-slate-700',
  hold: 'bg-amber-100 text-amber-800',
  rejected: 'bg-red-100 text-red-700',
}

const RISK_STYLES = {
  low: 'bg-green-100 text-green-700',
  medium: 'bg-amber-100 text-amber-800',
  high: 'bg-red-100 text-red-700',
}

function sortTopicCandidatesForAdmin(topics: MonthlyTopicCandidate[], sort: string) {
  return [...topics].sort((a, b) => {
    if (sort === 'title') return a.title.localeCompare(b.title, 'ja')
    if (sort === 'status') return a.status.localeCompare(b.status)
    if (sort === 'risk') return a.medicalRisk.localeCompare(b.medicalRisk)
    if (sort === 'priority') return b.priority.localeCompare(a.priority)
    return a.recommendedPublishDate.localeCompare(b.recommendedPublishDate) || a.id.localeCompare(b.id)
  })
}

export default async function TopicCandidatesPage({ searchParams }: PageProps) {
  if (!(await isAdminAuthenticated())) redirect('/admin/login')

  const params = await searchParams
  const month = params?.month ?? getDefaultTopicCandidateMonth()
  const statusFilter = params?.status ?? 'all'
  const riskFilter = params?.risk ?? 'all'
  const duplicateFilter = params?.duplicate ?? 'all'
  const priorityFilter = params?.priority ?? 'all'
  const sort = params?.sort ?? 'date'
  const file = await getMonthlyTopicCandidatesForAdmin(month)

  if (!file) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900">月次ネタ候補</h1>
        <div className="mt-6 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-sm text-gray-600">
          <p>{month} のネタ候補はまだありません。</p>
          <p className="mt-2 font-mono">npm run topic-candidates:generate -- --month {month} --yes</p>
        </div>
      </main>
    )
  }

  const summary = buildTopicCandidateSummary(file)
  const selectedProgress = `${summary.selectedCount} / ${summary.targetPostCount}`
  const visibleTopics = sortTopicCandidatesForAdmin(
    file.topics.filter((topic) => {
      if (statusFilter !== 'all' && topic.status !== statusFilter) return false
      if (riskFilter !== 'all' && topic.medicalRisk !== riskFilter) return false
      if (duplicateFilter !== 'all' && topic.duplicateRisk !== duplicateFilter) return false
      if (priorityFilter !== 'all' && topic.priority !== priorityFilter) return false
      return true
    }),
    sort,
  )

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">月次ネタ候補</h1>
          <p className="mt-2 text-sm text-gray-500">
            PCで月次ネタ候補を確認し、スマホでは簡易承認だけ行う想定です。
          </p>
        </div>
        <Link
          href={`/admin/topic-candidates?month=${file.month}`}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-bold text-white"
        >
          PCで確認する
        </Link>
      </div>

      <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
          <p className="text-xs font-bold text-blue-700">今月採用</p>
          <p className="mt-1 text-2xl font-bold text-blue-900">{selectedProgress}</p>
          <p className="sr-only">12 / 12 が月次目標です</p>
        </div>
        <SummaryTile label="候補" value={summary.candidateCount} />
        <SummaryTile label="予備" value={summary.backupCount} />
        <SummaryTile label="保留" value={summary.holdCount} />
        <SummaryTile label="高リスク" value={summary.highRiskCount} tone="red" />
        <SummaryTile label="重複注意" value={summary.duplicateWarningCount} tone="amber" />
      </section>

      <section className="mt-4">
        <FinalizeTopicCandidatesButton
          month={file.month}
          selectedCount={summary.selectedCount}
          targetPostCount={summary.targetPostCount}
        />
      </section>

      <form method="get" className="mt-6 grid gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm md:grid-cols-6">
        <input type="hidden" name="month" value={file.month} />
        <FilterSelect label="状態" name="status" value={statusFilter}>
          <option value="all">すべて</option>
          <option value="pending">未判断</option>
          <option value="selected">今月採用</option>
          <option value="backup">予備</option>
          <option value="hold">保留</option>
          <option value="rejected">却下</option>
        </FilterSelect>
        <FilterSelect label="医療リスク" name="risk" value={riskFilter}>
          <option value="all">すべて</option>
          <option value="low">low</option>
          <option value="medium">medium</option>
          <option value="high">high</option>
        </FilterSelect>
        <FilterSelect label="重複" name="duplicate" value={duplicateFilter}>
          <option value="all">すべて</option>
          <option value="low">low</option>
          <option value="medium">medium</option>
          <option value="high">high</option>
        </FilterSelect>
        <FilterSelect label="優先度" name="priority" value={priorityFilter}>
          <option value="all">すべて</option>
          <option value="high">high</option>
          <option value="medium">medium</option>
          <option value="low">low</option>
        </FilterSelect>
        <FilterSelect label="並び順" name="sort" value={sort}>
          <option value="date">推奨公開日順</option>
          <option value="priority">優先度順</option>
          <option value="status">状態順</option>
          <option value="risk">リスク順</option>
          <option value="title">タイトル順</option>
        </FilterSelect>
        <div className="flex items-end">
          <button className="w-full rounded-md bg-gray-900 px-3 py-2 text-sm font-bold text-white hover:bg-gray-800">
            絞り込む
          </button>
        </div>
      </form>

      <section className="mt-8 grid gap-4 lg:grid-cols-2">
        {visibleTopics.map((topic) => (
          <article key={topic.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_STYLES[topic.status]}`}>
                {STATUS_LABELS[topic.status]}
              </span>
              <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700">
                {topic.category}
              </span>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${RISK_STYLES[topic.medicalRisk]}`}>
                医療リスク: {topic.medicalRisk}
              </span>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${RISK_STYLES[topic.duplicateRisk]}`}>
                重複: {topic.duplicateRisk}
              </span>
            </div>

            <h2 className="mt-3 text-base font-bold leading-snug text-gray-900">{topic.title}</h2>
            <p className="mt-2 text-sm text-gray-600">{topic.recommendedReason}</p>
            <p className="mt-2 text-xs text-gray-500">
              推奨公開日: <span className="font-semibold">{topic.recommendedPublishDate}</span>
            </p>

            <TopicCandidateActionButtons month={file.month} id={topic.id} />

            <details className="mt-3 rounded-md bg-gray-50 p-3 text-xs text-gray-600">
              <summary className="cursor-pointer font-bold text-gray-700">詳細を見る</summary>
              <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                <Detail label="ID" value={topic.id} />
                <Detail label="想定読者" value={topic.targetReader} />
                <Detail label="検索意図" value={topic.searchIntent} />
                <Detail label="悩み" value={topic.patientConcern} />
                <Detail label="キーワード" value={topic.targetKeyword} />
                <Detail label="優先度" value={topic.priority} />
                {topic.reviewerNote && <Detail label="判断メモ" value={topic.reviewerNote} />}
              </dl>
            </details>
          </article>
        ))}
        {visibleTopics.length === 0 && (
          <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-sm text-gray-500 lg:col-span-2">
            条件に合うネタ候補はありません。
          </div>
        )}
      </section>
    </main>
  )
}

function FilterSelect({
  label,
  name,
  value,
  children,
}: {
  label: string
  name: string
  value: string
  children: React.ReactNode
}) {
  return (
    <label className="text-xs font-bold text-gray-600">
      {label}
      <select name={name} defaultValue={value} className="mt-1 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800">
        {children}
      </select>
    </label>
  )
}

function SummaryTile({ label, value, tone = 'gray' }: { label: string; value: number; tone?: 'gray' | 'red' | 'amber' }) {
  const styles = {
    gray: 'border-gray-200 bg-white text-gray-900',
    red: 'border-red-100 bg-red-50 text-red-900',
    amber: 'border-amber-100 bg-amber-50 text-amber-900',
  }
  return (
    <div className={`rounded-lg border p-4 ${styles[tone]}`}>
      <p className="text-xs font-bold text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-bold text-gray-700">{label}</dt>
      <dd className="mt-0.5 break-words">{value}</dd>
    </div>
  )
}
