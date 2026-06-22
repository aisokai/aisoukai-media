import { readFileSync } from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'

test('ops:mwf connects the scheduled blog agent before Telegram review notification', () => {
  const source = readFileSync('scripts/ops-mwf.mjs', 'utf8')

  assert.match(source, /定期記事生成/)
  assert.match(source, /scheduled-article-flow\.mjs/)
  assert.match(source, /--no-generate/)
  assert.match(source, /--auto-publish/)
  assert.match(source, /--result-json/)
  assert.match(source, /--no-notify/)
  assert.match(source, /ANTHROPIC_API_KEY 未設定/)
  assert.match(source, /review待ちが \$\{reviewCount\}件あるため/)
  assert.match(source, /記事は保存しましたが、公開扱いではありません/)
  assert.match(source, /新規記事を1件公開扱いにしました/)

  const scheduledIndex = source.indexOf("run('scheduled-article-flow.mjs'")
  const pendingNotifyIndex = source.indexOf("run('notify-pending-review.mjs')")
  const resultNotifyIndex = source.lastIndexOf('await sendOpsResultTelegram')
  assert.ok(scheduledIndex > 0)
  assert.ok(pendingNotifyIndex > scheduledIndex)
  assert.ok(resultNotifyIndex > pendingNotifyIndex)
})
