import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, FileSpreadsheet } from 'lucide-react'
import { isAdminAuthenticated } from '@/lib/adminAuth'
import { type ArticleTopicRow, loadAdminArticleTopics } from '@/lib/articleTopics'
import { readGitHubArticleTopicsCsv } from '@/lib/articleTopicsGithub'
import { NOINDEX_METADATA } from '@/lib/seo'
import ArticleTopicEditControls from './ArticleTopicEditControls'

export const metadata: Metadata = {
  title: 'Article Topics | Admin',
  ...NOINDEX_METADATA,
}

export const dynamic = 'force-dynamic'

type PageProps = {
  searchParams?: Promise<{
    status?: string
    risk?: string
    category?: string
    monthly?: string
    sort?: string
  }>
}

const STATUS_STYLES: Record<string, string> = {
  approved: 'bg-blue-100 text-blue-800',
  idea: 'bg-gray-100 text-gray-700',
  drafting: 'bg-amber-100 text-amber-800',
  reviewed: 'bg-green-100 text-green-800',
  published: 'bg-emerald-100 text-emerald-800',
  hold: 'bg-slate-100 text-slate-700',
}

const RISK_STYLES: Record<string, string> = {
  low: 'bg-green-100 text-green-700',
  medium: 'bg-amber-100 text-amber-800',
  high: 'bg-red-100 text-red-700',
}

function sortArticleTopicsForAdmin(rows: ArticleTopicRow[], sort: string) {
  return [...rows].sort((a, b) => {
    if (sort === 'title') return a.titleCandidate.localeCompare(b.titleCandidate, 'ja')
    if (sort === 'status') return a.status.localeCompare(b.status)
    if (sort === 'risk') return a.medicalRisk.localeCompare(b.medicalRisk)
    const ad = a.publishDate || a.discoveredAt
    const bd = b.publishDate || b.discoveredAt
    return sort === 'oldest'
      ? ad.localeCompare(bd) || a.id.localeCompare(b.id)
      : bd.localeCompare(ad) || b.id.localeCompare(a.id)
  })
}

export default async function ArticleTopicsPage({ searchParams }: PageProps) {
  if (!(await isAdminAuthenticated())) redirect('/admin/login')

  const params = await searchParams
  const statusFilter = params?.status ?? 'all'
  const riskFilter = params?.risk ?? 'all'
  const categoryFilter = params?.category ?? 'all'
  const monthlyOnly = params?.monthly === 'yes'
  const sort = params?.sort ?? 'newest'
  const loaded = await loadAdminArticleTopics(readGitHubArticleTopicsCsv)
  const rows = loaded.ok ? loaded.data.topics : []
  const summary = loaded.ok ? loaded.data.summary : null
  const categories = [...new Set(rows.map((row) => row.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ja'))
  const visibleRows = sortArticleTopicsForAdmin(
    rows.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false
      if (riskFilter !== 'all' && row.medicalRisk !== riskFilter) return false
      if (categoryFilter !== 'all' && row.category !== categoryFilter) return false
      if (monthlyOnly && !row.id.startsWith('MONTHLY-')) return false
      return true
    }),
    sort,
  ).slice(0, 80)

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link href="/admin" className="inline-flex items-center gap-1 text-sm font-semibold text-gray-500 hover:text-gray-900">
            <ArrowLeft className="h-4 w-4" />
            管理トップ
          </Link>
          <h1 className="mt-3 flex items-center gap-2 text-2xl font-bold text-gray-900">
            <FileSpreadsheet className="h-6 w-6 text-blue-700" />
            採用CSV
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            月次ネタ候補から確定した記事ネタと、既存のネタDBを確認します。
          </p>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          status / publish_date / notes をこの画面から編集できます。
        </div>
      </div>

      <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <SummaryTile label="全ネタ" value={summary?.total ?? '読込不可'} />
        <SummaryTile label="採用済み" value={summary?.approved ?? '読込不可'} tone="blue" />
        <SummaryTile label="アイデア" value={summary?.idea ?? '読込不可'} />
        <SummaryTile label="高リスク" value={summary?.highRisk ?? '読込不可'} tone="red" />
        <SummaryTile label="月次追加" value={summary?.monthly ?? '読込不可'} tone="green" />
      </section>

      {loaded.ok ? (
        <p className={`mt-4 rounded-lg border px-4 py-3 text-sm ${loaded.source === 'local_fallback' ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-gray-200 bg-gray-50 text-gray-600'}`}>
          読込元: {loaded.source === 'github_main' ? 'GitHub main' : loaded.source === 'local_fallback' ? 'ローカル（GitHub読込失敗時のフォールバック）' : 'ローカル'}
          {loaded.errorCode && '。GitHubの読込に失敗したため、ローカルCSVを表示しています。'}
        </p>
      ) : (
        <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-900">
          記事ネタCSVを読み込めません ({loaded.errorCode})。件数0件として表示していません。
        </p>
      )}

      <form method="get" className="mt-6 grid gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm md:grid-cols-6">
        <FilterSelect label="状態" name="status" value={statusFilter}>
          <option value="all">すべて</option>
          <option value="approved">approved</option>
          <option value="idea">idea</option>
          <option value="drafting">drafting</option>
          <option value="reviewed">reviewed</option>
          <option value="published">published</option>
          <option value="hold">hold</option>
        </FilterSelect>
        <FilterSelect label="医療リスク" name="risk" value={riskFilter}>
          <option value="all">すべて</option>
          <option value="low">low</option>
          <option value="medium">medium</option>
          <option value="high">high</option>
        </FilterSelect>
        <FilterSelect label="カテゴリ" name="category" value={categoryFilter}>
          <option value="all">すべて</option>
          {categories.map((category) => (
            <option key={category} value={category}>{category}</option>
          ))}
        </FilterSelect>
        <FilterSelect label="月次" name="monthly" value={monthlyOnly ? 'yes' : 'all'}>
          <option value="all">すべて</option>
          <option value="yes">月次追加のみ</option>
        </FilterSelect>
        <FilterSelect label="並び順" name="sort" value={sort}>
          <option value="newest">新しい順</option>
          <option value="oldest">古い順</option>
          <option value="title">タイトル順</option>
          <option value="status">状態順</option>
          <option value="risk">リスク順</option>
        </FilterSelect>
        <div className="flex items-end">
          <button className="w-full rounded-md bg-gray-900 px-3 py-2 text-sm font-bold text-white hover:bg-gray-800">
            絞り込む
          </button>
        </div>
      </form>

      {loaded.ok ? <section className="mt-8 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-4 py-3">
          <h2 className="text-sm font-bold text-gray-900">ネタ一覧</h2>
          <p className="mt-1 text-xs text-gray-500">条件に合うものを最大80件表示します。</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <thead className="bg-gray-50 text-left text-xs font-bold text-gray-500">
              <tr>
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">タイトル</th>
                <th className="px-4 py-3">カテゴリ</th>
                <th className="px-4 py-3">状態</th>
                <th className="px-4 py-3">リスク</th>
                <th className="px-4 py-3">公開予定</th>
                <th className="px-4 py-3">編集</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visibleRows.map((row) => (
                <tr key={row.id} className="align-top">
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-gray-500">{row.id}</td>
                  <td className="min-w-[280px] px-4 py-3">
                    <p className="font-semibold text-gray-900">{row.titleCandidate}</p>
                    <p className="mt-1 text-xs text-gray-500">{row.targetKeyword}</p>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-gray-700">{row.category}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_STYLES[row.status] ?? 'bg-gray-100 text-gray-700'}`}>
                      {row.status || '未設定'}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${RISK_STYLES[row.medicalRisk] ?? 'bg-gray-100 text-gray-700'}`}>
                      {row.medicalRisk || '未設定'}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-gray-700">{row.publishDate}</td>
                  <td className="px-4 py-3">
                    <ArticleTopicEditControls
                      id={row.id}
                      initialStatus={row.status}
                      initialTitleCandidate={row.titleCandidate}
                      initialCategory={row.category}
                      initialTargetKeyword={row.targetKeyword}
                      initialPatientIntent={row.patientIntent}
                      initialPriority={row.priority}
                      initialMedicalRisk={row.medicalRisk}
                      initialPublishDate={row.publishDate}
                      initialNotes={row.notes}
                    />
                  </td>
                </tr>
              ))}
              {visibleRows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-500">
                    条件に合うネタはありません。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section> : null}
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

function SummaryTile({ label, value, tone = 'gray' }: { label: string; value: number | string; tone?: 'gray' | 'blue' | 'red' | 'green' }) {
  const styles = {
    gray: 'border-gray-200 bg-white text-gray-900',
    blue: 'border-blue-100 bg-blue-50 text-blue-900',
    red: 'border-red-100 bg-red-50 text-red-900',
    green: 'border-green-100 bg-green-50 text-green-900',
  }
  return (
    <div className={`rounded-lg border p-4 ${styles[tone]}`}>
      <p className="text-xs font-bold text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  )
}
