'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { savePostMarkdownAction } from '../../actions'

export default function PostMarkdownEditor({
  slug,
  initialMarkdown,
}: {
  slug: string
  initialMarkdown: string
}) {
  const router = useRouter()
  const [markdown, setMarkdown] = useState(initialMarkdown)
  const [message, setMessage] = useState('')
  const [isPending, startTransition] = useTransition()

  const save = () => {
    startTransition(async () => {
      setMessage('')
      const result = await savePostMarkdownAction(slug, markdown)
      setMessage(result.message)
      if (result.ok) router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      <textarea
        value={markdown}
        onChange={(event) => setMarkdown(event.target.value)}
        className="min-h-[70vh] w-full rounded-lg border border-gray-200 bg-white p-4 font-mono text-sm leading-6 text-gray-900 shadow-sm"
        spellCheck={false}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-gray-500">
          frontmatter と本文をまとめて保存します。保存時に Markdown が parse できるか確認します。
        </p>
        <button
          type="button"
          disabled={isPending}
          onClick={save}
          className="rounded-md bg-blue-700 px-4 py-2 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-50"
        >
          {isPending ? '保存中...' : '保存する'}
        </button>
      </div>
      {message && <p className="rounded-md bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-700">{message}</p>}
    </div>
  )
}
