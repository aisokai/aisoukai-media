'use client'

import { useCallback, useEffect, useState } from 'react'
import { DmpActionCreateForm } from './DmpActionCreateForm'

type ActionItem = {
  id: string
  type: string
  channel: string
  origin_surface: string
  status: string
  actor: { display_name: string }
  target: { kind: string; id: string; path?: string; slug?: string }
  safety: {
    risk_level: string
    requires_human: boolean
    external_effect: boolean
    production_effect: boolean
    allowed_executor: string
  }
  audit: Array<{
    timestamp: string
    actor: string
    from_status: string
    to_status: string
    note: string
  }>
  created_at: string
}

type ActionSummary = {
  total: number
  pending: number
  blocked: number
  validated: number
  waiting_human: number
  done: number
  failed: number
  cancelled: number
}

const STATUS_LABEL: Record<string, string> = {
  draft: '下書き',
  pending: '処理待ち',
  validated: '検証済み',
  waiting_human: '先生確認待ち',
  ready_for_local_execution: '実行準備完了',
  executing: '実行中',
  done: '完了',
  failed: '失敗',
  cancelled: 'キャンセル',
  blocked: 'ブロック',
}

const STATUS_COLOR: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800',
  blocked: 'bg-red-100 text-red-800',
  waiting_human: 'bg-amber-100 text-amber-800',
  validated: 'bg-green-100 text-green-800',
  done: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-500',
}

const TYPE_LABEL: Record<string, string> = {
  'content.create_request': '記事依頼',
  'content.generate_draft': '下書き生成',
  'content.review.approve': '承認',
  'content.review.return': '差し戻し',
  'content.review.request_revision': '修正依頼',
  'content.review.hold': '保留',
  'content.edit_markdown': 'MD編集',
  'content.archive': 'アーカイブ',
  'content.restore': '復元',
  'content.mark_delete_candidate': '削除候補',
  'content.delete_physical': '物理削除',
  'image.upload_inbox': '画像アップロード',
  'image.ingest': '画像取り込み',
  'image.assign': '画像割当',
  'image.replace_request': '画像差し替え',
  'repo.validate': '検証',
  'repo.build': 'ビルド',
  'repo.commit_local': 'ローカルcommit',
  'repo.push_request': 'push依頼',
  'deploy.observe': 'デプロイ監視',
  'media.draft': 'メディア下書き',
  'media.approve': 'メディア承認',
}

const ORIGIN_LABEL: Record<string, string> = {
  mitanios_dmp: 'MitaniOS',
  aisoukai_admin: '/admin',
  telegram: 'Telegram',
  cli: 'CLI',
  scheduler: 'スケジューラ',
}

export function DmpActionPanel() {
  const [actions, setActions] = useState<ActionItem[]>([])
  const [summary, setSummary] = useState<ActionSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const fetchActions = useCallback(async () => {
    setLoading(true)
    try {
      const [actionsRes, summaryRes] = await Promise.all([
        fetch('/api/dmp-core/v1/actions'),
        fetch('/api/dmp-core/v1/actions/summary'),
      ])
      const actionsData = await actionsRes.json()
      const summaryData = await summaryRes.json()
      if (actionsData.ok) setActions(actionsData.data ?? [])
      if (summaryData.ok) setSummary(summaryData.data)
    } catch {
      // dry-run のため取得失敗は許容
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchActions() }, [fetchActions])

  const selected = selectedId ? actions.find((a) => a.id === selectedId) ?? null : null

  return (
    <div className="mt-6 space-y-6">
      {/* サマリ */}
      <section className="grid gap-3 md:grid-cols-4">
        <SummaryTile label="Action 合計" value={summary?.total ?? 0} />
        <SummaryTile label="処理待ち" value={summary?.pending ?? 0} tone="amber" />
        <SummaryTile label="先生確認待ち" value={summary?.waiting_human ?? 0} tone="amber" />
        <SummaryTile label="ブロック" value={summary?.blocked ?? 0} tone="red" />
      </section>

      {/* Action 作成フォーム */}
      <DmpActionCreateForm onCreated={fetchActions} />

      {/* Action 一覧 */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">Action 一覧</h2>
          <button
            type="button"
            onClick={fetchActions}
            disabled={loading}
            className="rounded-md bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50"
          >
            {loading ? '読込中…' : '更新'}
          </button>
        </div>
        {actions.length === 0 ? (
          <p className="text-sm text-gray-500">Action queue は空です（dry-run モード）</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">Status</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">Type</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">Channel</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">Source</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">Target</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">Actor</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">作成日時</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {actions.map((action) => (
                  <tr
                    key={action.id}
                    className="cursor-pointer hover:bg-gray-50"
                    onClick={() => setSelectedId(selectedId === action.id ? null : action.id)}
                  >
                    <td className="px-3 py-2">
                      <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[action.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {STATUS_LABEL[action.status] ?? action.status}
                      </span>
                    </td>
                    <td className="px-3 py-2">{TYPE_LABEL[action.type] ?? action.type}</td>
                    <td className="px-3 py-2">{action.channel}</td>
                    <td className="px-3 py-2">{ORIGIN_LABEL[action.origin_surface] ?? action.origin_surface}</td>
                    <td className="px-3 py-2 font-mono text-xs">{action.target.slug ?? action.target.path ?? action.target.id}</td>
                    <td className="px-3 py-2">{action.actor.display_name}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">{action.created_at?.slice(0, 19)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 詳細パネル */}
      {selected && (
        <section className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-base font-bold text-gray-900">Action 詳細: {selected.id}</h3>
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              閉じる
            </button>
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <DetailItem label="Status" value={STATUS_LABEL[selected.status] ?? selected.status} />
            <DetailItem label="Type" value={TYPE_LABEL[selected.type] ?? selected.type} />
            <DetailItem label="Channel" value={selected.channel} />
            <DetailItem label="Source" value={ORIGIN_LABEL[selected.origin_surface] ?? selected.origin_surface} />
            <DetailItem label="Human Gate" value={selected.safety.requires_human ? '必須' : '不要'} tone={selected.safety.requires_human ? 'amber' : 'green'} />
            <DetailItem label="外部効果" value={selected.safety.external_effect ? 'あり' : 'なし'} tone={selected.safety.external_effect ? 'red' : 'green'} />
            <DetailItem label="Risk Level" value={selected.safety.risk_level} />
            <DetailItem label="Executor" value={selected.safety.allowed_executor} />
          </div>
          <div className="mt-4">
            <h4 className="mb-2 text-sm font-bold text-gray-700">監査ログ</h4>
            {selected.audit.length === 0 ? (
              <p className="text-sm text-gray-500">監査ログなし</p>
            ) : (
              <ul className="space-y-1 text-xs text-gray-600">
                {selected.audit.map((entry, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="font-mono text-gray-400">{entry.timestamp?.slice(0, 19)}</span>
                    <span>{entry.actor}: {STATUS_LABEL[entry.from_status] ?? entry.from_status} → {STATUS_LABEL[entry.to_status] ?? entry.to_status}</span>
                    {entry.note && <span className="text-gray-400">({entry.note})</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p className="mt-3 text-xs text-gray-400">
            Phase3 dry-run モード — 実行ボタンはありません
          </p>
        </section>
      )}
    </div>
  )
}

function SummaryTile({ label, value, tone }: { label: string; value: number; tone?: string }) {
  const bg = tone === 'amber' && value > 0 ? 'border-amber-200 bg-amber-50'
    : tone === 'red' && value > 0 ? 'border-red-200 bg-red-50'
    : 'border-gray-200 bg-white'
  return (
    <div className={`rounded-lg border p-3 ${bg}`}>
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
    </div>
  )
}

function DetailItem({ label, value, tone }: { label: string; value: string; tone?: string }) {
  const color = tone === 'amber' ? 'text-amber-700' : tone === 'red' ? 'text-red-700' : tone === 'green' ? 'text-green-700' : 'text-gray-900'
  return (
    <div>
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className={`mt-0.5 text-sm font-medium ${color}`}>{value}</p>
    </div>
  )
}
