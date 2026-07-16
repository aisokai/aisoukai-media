import assert from 'node:assert/strict'
import test from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runThemeOpsFallback } from '../scripts/lib/theme-ops-fallback.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const draftPath = join(ROOT, 'content', 'posts', '2026-07-17-topic-0123456789abcdef.md')

function successResult() {
  return {
    ok: true,
    output: `RESULT_JSON ${JSON.stringify({
      generated: true,
      audited: true,
      draft_path: draftPath,
      selected: { title_candidate: 'テーマ記事' },
      audit: {
        status: 'PASS',
        title: 'テーマ記事',
        frontmatter: {
          source_theme_topic_id: 'topic_0123456789abcdef',
          publish_at: '2026-07-17',
          image: '/images/library/general/example.png',
          image_alt: '記事のイメージ',
        },
      },
    })}`,
  }
}

test('theme fallback exports the canonical CSV then returns an audited draft for ops sync', () => {
  const calls = []
  const result = runThemeOpsFallback({
    today: '2026-07-17',
    runProcess: (_command, args, options) => {
      calls.push({ args, options })
      return calls.length === 1 ? { ok: true, output: '{"ok":true}' } : successResult()
    },
  })

  assert.equal(result.ok, true)
  assert.equal(result.generated, true)
  assert.equal(result.topicId, 'topic_0123456789abcdef')
  assert.equal(result.path, 'content/posts/2026-07-17-topic-0123456789abcdef.md')
  assert.equal(result.image.ok, true)
  assert.equal(calls.length, 2)
  assert.deepEqual(calls[0].args.slice(-1), ['--write'])
  assert.deepEqual(calls[1].args.slice(-3), ['--generate', '--publish-date', '2026-07-17'])
})

test('theme fallback fails closed when the canonical CSV export fails', () => {
  const result = runThemeOpsFallback({
    today: '2026-07-17',
    runProcess: () => ({ ok: false, output: 'failed' }),
  })
  assert.deepEqual(result, {
    ok: false,
    generated: false,
    reason: 'テーマCSVの更新に失敗したため記事生成を停止しました',
    reasons: ['テーマCSVの更新に失敗したため記事生成を停止しました'],
  })
})

test('theme fallback rejects unaudited or unsafe results', () => {
  const result = runThemeOpsFallback({
    today: '2026-07-17',
    runProcess: () => ({
      ok: true,
      output: 'RESULT_JSON {"generated":true,"audited":false}',
    }),
  })
  assert.equal(result.ok, false)
  assert.match(result.reason, /生成結果を確認/)
})
