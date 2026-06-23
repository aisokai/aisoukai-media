'use client'

import { useState, useCallback } from 'react'

const ACTION_TYPE_OPTIONS = [
  { value: 'content.create_request', label: '記事依頼' },
  { value: 'content.generate_draft', label: '下書き生成' },
  { value: 'content.review.approve', label: '承認' },
  { value: 'content.review.return', label: '差し戻し' },
  { value: 'content.review.request_revision', label: '修正依頼' },
  { value: 'content.review.hold', label: '保留' },
  { value: 'content.edit_markdown', label: 'MD編集' },
  { value: 'content.archive', label: 'アーカイブ' },
  { value: 'content.restore', label: '復元' },
  { value: 'content.mark_delete_candidate', label: '削除候補' },
  { value: 'content.delete_physical', label: '物理削除' },
  { value: 'image.upload_inbox', label: '画像アップロード' },
  { value: 'image.ingest', label: '画像取り込み' },
  { value: 'image.assign', label: '画像割当' },
  { value: 'image.replace_request', label: '画像差し替え' },
  { value: 'repo.validate', label: '検証' },
  { value: 'repo.build', label: 'ビルド' },
  { value: 'repo.commit_local', label: 'ローカルcommit' },
  { value: 'repo.push_request', label: 'push依頼' },
  { value: 'deploy.observe', label: 'デプロイ監視' },
  { value: 'media.draft', label: 'メディア下書き' },
  { value: 'media.approve', label: 'メディア承認' },
] as const

const CHANNEL_OPTIONS = [
  { value: 'blog', label: 'ブログ' },
  { value: 'gmb', label: 'GMB' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'x', label: 'X' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'image', label: '画像' },
  { value: 'system', label: 'システム' },
] as const

const BLOCKED_TYPES = new Set(['repo.push_request', 'media.approve', 'content.delete_physical'])
const EXTERNAL_TYPES = new Set(['repo.push_request', 'media.approve', 'media.draft', 'deploy.observe'])

function getTargetKind(type: string): string {
  if (type.startsWith('image.')) return 'image'
  if (type.startsWith('repo.') || type.startsWith('deploy.')) return 'repo'
  if (type.startsWith('media.')) return 'media_draft'
  return 'post'
}

type Props = {
  onCreated: () => void
}

export function DmpActionCreateForm({ onCreated }: Props) {
  const [open, setOpen] = useState(false)
  const [actionType, setActionType] = useState('content.create_request')
  const [channel, setChannel] = useState('blog')
  const [targetId, setTargetId] = useState('')
  const [targetPath, setTargetPath] = useState('')
  const [actorName, setActorName] = useState('先生')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message?: string; errors?: string[] } | null>(null)

  const willBlock = BLOCKED_TYPES.has(actionType) || EXTERNAL_TYPES.has(actionType)
  const hasExternal = EXTERNAL_TYPES.has(actionType)

  const handleSubmit = useCallback(async () => {
    if (!targetId.trim()) {
      setResult({ ok: false, errors: ['target.id は必須です'] })
      return
    }
    setSubmitting(true)
    setResult(null)
    try {
      const body = {
        type: actionType,
        channel,
        origin_surface: 'aisoukai_admin',
        actor: { kind: 'human', display_name: actorName || '先生' },
        target: {
          kind: getTargetKind(actionType),
          id: targetId.trim(),
          ...(targetPath.trim() ? { path: targetPath.trim() } : {}),
        },
        requested_transition: '',
        payload: {},
        safety: {
          risk_level: willBlock ? 'high' : 'low',
          requires_human: willBlock,
          external_effect: hasExternal,
          production_effect: false,
          allowed_executor: willBlock ? 'human_only' : 'local_mitani',
        },
        git: {
          repo: 'aisokai/aisoukai-media',
          base_ref: 'main',
        },
      }
      const res = await fetch('/api/dmp-core/v1/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (data.ok) {
        setResult({ ok: true, message: data.message ?? 'Action 作成完了' })
        setTargetId('')
        setTargetPath('')
        onCreated()
      } else {
        setResult({ ok: false, errors: data.errors ?? ['作成に失敗しました'] })
      }
    } catch (err) {
      setResult({ ok: false, errors: [err instanceof Error ? err.message : '通信エラー'] })
    } finally {
      setSubmitting(false)
    }
  }, [actionType, channel, targetId, targetPath, actorName, willBlock, hasExternal, onCreated])

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
      >
        + dry-run Action 作成
      </button>
    )
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-bold text-gray-900">dry-run Action 作成</h2>
          <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">dry-run</span>
          <span className="rounded bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600">aisoukai_admin</span>
        </div>
        <button
          type="button"
          onClick={() => { setOpen(false); setResult(null) }}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          閉じる
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Action Type</span>
          <select
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            value={actionType}
            onChange={(e) => setActionType(e.target.value)}
          >
            {ACTION_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Channel</span>
          <select
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
          >
            {CHANNEL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Target ID（slug / ファイル名）</span>
          <input
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            type="text"
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            placeholder="例: 2025-06-23-example"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Target Path（任意）</span>
          <input
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            type="text"
            value={targetPath}
            onChange={(e) => setTargetPath(e.target.value)}
            placeholder="例: content/posts/2025-06-23-example.md"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-gray-700">操作者名</span>
          <input
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            type="text"
            value={actorName}
            onChange={(e) => setActorName(e.target.value)}
            placeholder="先生"
          />
        </label>
      </div>

      {willBlock && (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          <span className="font-bold">blocked:</span> この Action Type は自動的に blocked 状態で作成されます（{hasExternal ? '外部効果あり' : 'Phase2制限'}）
        </p>
      )}

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? '作成中…' : 'dry-run Action を作成'}
        </button>
      </div>

      {result && (
        <div className={`mt-3 rounded-md px-3 py-2 text-sm ${result.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {result.ok ? result.message : result.errors?.join(' / ')}
        </div>
      )}
    </section>
  )
}
