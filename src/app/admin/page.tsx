import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  Archive,
  CheckSquare,
  FileEdit,
  FileSpreadsheet,
  LayoutDashboard,
  PencilLine,
  ShieldCheck,
  Trash2,
} from 'lucide-react'
import { isAdminAuthenticated } from '@/lib/adminAuth'
import { buildArticleTopicSummary, getArticleTopics } from '@/lib/articleTopics'
import { getAdminPosts } from '@/lib/adminPosts'
import { getDefaultTopicCandidateMonth, getMonthlyTopicCandidatesForAdmin, buildTopicCandidateSummary } from '@/lib/monthlyTopicCandidates'
import { getPendingReviewPostsForAdmin } from '@/lib/posts'
import { NOINDEX_METADATA } from '@/lib/seo'

export const metadata: Metadata = {
  title: 'Admin Dashboard',
  ...NOINDEX_METADATA,
}

export const dynamic = 'force-dynamic'

function currentJstMonth() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 7)
}

export default async function AdminDashboardPage() {
  if (!(await isAdminAuthenticated())) redirect('/admin/login')

  const pendingPosts = await getPendingReviewPostsForAdmin()
  const allPosts = await getAdminPosts()
  const pendingCount = pendingPosts.filter((post) => !post.rejectionReason).length
  const rejectedCount = pendingPosts.filter((post) => post.rejectionReason).length
  const archivedPosts = allPosts.filter((post) => post.archived).length
  const topicRows = getArticleTopics()
  const topicSummary = buildArticleTopicSummary(topicRows)
  const month = currentJstMonth()
  const topicFile = await getMonthlyTopicCandidatesForAdmin(month)
    ?? await getMonthlyTopicCandidatesForAdmin(getDefaultTopicCandidateMonth())
  const monthlySummary = topicFile ? buildTopicCandidateSummary(topicFile) : null

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">Aisoukai Media Admin</p>
          <h1 className="mt-2 flex items-center gap-2 text-2xl font-bold text-gray-900">
            <LayoutDashboard className="h-6 w-6" />
            管理トップ
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
            記事レビュー、月次ネタ採用、採用CSV確認、記事管理系ツールをまとめた入口です。
            公開や削除のような強い操作は、専用フローができるまでここからは実行しません。
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600 shadow-sm">
          <span className="font-bold text-gray-900">対象月:</span> {monthlySummary?.month ?? month}
        </div>
      </div>

      <section className="mt-6 grid gap-3 md:grid-cols-4">
        <Metric label="レビュー待ち" value={pendingCount} tone="amber" href="/admin/pending-review?status=pending" />
        <Metric label="差し戻し" value={rejectedCount} tone="red" href="/admin/pending-review?status=rejected" />
        <Metric
          label="今月採用"
          value={monthlySummary ? `${monthlySummary.selectedCount}/${monthlySummary.targetPostCount}` : 'なし'}
          tone="blue"
          href={`/admin/topic-candidates?month=${monthlySummary?.month ?? month}&status=selected`}
        />
        <Metric label="採用CSV" value={`${topicSummary.approved}件`} tone="green" href="/admin/article-topics?status=approved" />
      </section>

      <section className="mt-8 grid gap-4 lg:grid-cols-2">
        <ToolCard
          icon={<CheckSquare className="h-5 w-5" />}
          title="記事の承認・却下"
          description="Human review 待ち記事を確認し、承認・却下・差し戻し済み再承認を行います。"
          href="/admin/pending-review"
          badge={`${pendingCount}件待ち`}
          tone="amber"
        />
        <ToolCard
          icon={<PencilLine className="h-5 w-5" />}
          title="ネタの採用・予備・保留・却下"
          description="月次ネタ候補を確認し、今月採用を確定して記事ネタCSVへ送ります。"
          href={`/admin/topic-candidates?month=${monthlySummary?.month ?? month}`}
          badge={monthlySummary ? `${monthlySummary.selectedCount}/${monthlySummary.targetPostCount} 採用` : '候補なし'}
          tone="blue"
        />
        <ToolCard
          icon={<FileSpreadsheet className="h-5 w-5" />}
          title="採用CSVの確認"
          description="確定済みの記事ネタCSVを確認し、状態・公開予定日・メモを編集します。"
          href="/admin/article-topics"
          badge={`${topicSummary.total}件`}
          tone="green"
        />
        <ToolCard
          icon={<FileEdit className="h-5 w-5" />}
          title="記事管理"
          description="記事の手動編集、アーカイブ、復帰、削除をまとめて扱います。"
          href="/admin/posts"
          badge={`${allPosts.length}件`}
          tone="blue"
        />
        <ToolCard
          icon={<ShieldCheck className="h-5 w-5" />}
          title="公開前チェック"
          description="投稿状態・画像・publish-ready の検証コマンドへ進むための運用メモです。"
          href="/admin#ops"
          badge="確認用"
          tone="slate"
        />
      </section>

      <section className="mt-10" id="ops">
        <div className="mb-4">
          <h2 className="text-lg font-bold text-gray-900">記事管理ツール</h2>
          <p className="mt-1 text-sm text-gray-500">
            削除・直接編集・アーカイブ復帰は影響が大きいため、専用の履歴付きUIを作るまでは入口だけ表示します。
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <ToolCard
            icon={<FileEdit className="h-5 w-5" />}
            title="記事の手動編集"
            description="Markdown frontmatter と本文を直接編集します。保存時に parse 可能か確認します。"
            href="/admin/posts"
            badge={`${allPosts.length}件`}
            tone="blue"
          />
          <ToolCard
            icon={<Archive className="h-5 w-5" />}
            title="アーカイブ・復帰"
            description="記事を公開対象から外す、またはアーカイブから戻します。操作履歴を残します。"
            href="/admin/posts"
            badge={`${archivedPosts}件 archived`}
            tone="slate"
          />
          <ToolCard
            icon={<Trash2 className="h-5 w-5" />}
            title="記事削除"
            description="slug 入力確認つきで物理削除します。通常はアーカイブを優先してください。"
            href="/admin/posts"
            badge="確認必須"
            tone="amber"
          />
        </div>
      </section>
    </main>
  )
}

function Metric({
  label,
  value,
  tone,
  href,
}: {
  label: string
  value: string | number
  tone: 'amber' | 'red' | 'blue' | 'green'
  href: string
}) {
  const styles = {
    amber: 'border-amber-100 bg-amber-50 text-amber-900',
    red: 'border-red-100 bg-red-50 text-red-900',
    blue: 'border-blue-100 bg-blue-50 text-blue-900',
    green: 'border-green-100 bg-green-50 text-green-900',
  }
  return (
    <Link href={href} className={`rounded-lg border p-4 transition hover:-translate-y-0.5 hover:shadow-sm ${styles[tone]}`}>
      <p className="text-xs font-bold text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </Link>
  )
}

function ToolCard({
  icon,
  title,
  description,
  href,
  badge,
  tone,
}: {
  icon: React.ReactNode
  title: string
  description: string
  href: string
  badge: string
  tone: 'amber' | 'blue' | 'green' | 'slate'
}) {
  const styles = {
    amber: 'bg-amber-50 text-amber-800',
    blue: 'bg-blue-50 text-blue-800',
    green: 'bg-green-50 text-green-800',
    slate: 'bg-slate-50 text-slate-800',
  }
  return (
    <Link href={href} className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${styles[tone]}`}>{icon}</div>
        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-bold text-gray-600">{badge}</span>
      </div>
      <h2 className="mt-4 text-base font-bold text-gray-900">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-gray-500">{description}</p>
    </Link>
  )
}
