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
  assert.match(source, /定期更新成功とは扱いません/)
  assert.match(source, /状態: 記事は保存していません/)
  assert.match(source, /新規記事を1件公開扱いにしました/)
  assert.match(source, /todayLiveItems/)
  assert.match(source, /本日公開対象は既に公開中/)
  assert.match(source, /item\.reviewed === true/)
  assert.match(source, /item\.draft === false/)
  assert.match(source, /item\.publishAtSource === 'publish_at'/)
  assert.match(source, /item\.publishAt === TODAY/)
  assert.match(source, /追加生成した記事は保存のみ/)

  const scheduledIndex = source.indexOf("run('scheduled-article-flow.mjs'")
  const pendingNotifyIndex = source.indexOf("run('notify-pending-review.mjs')")
  const resultNotifyIndex = source.lastIndexOf('await sendOpsResultTelegram')
  const alreadyLiveIndex = source.indexOf('本日公開対象は既に公開中')
  const noNewIndex = source.indexOf('⚠️ 新規公開なし')
  assert.ok(scheduledIndex > 0)
  assert.ok(pendingNotifyIndex > scheduledIndex)
  assert.ok(resultNotifyIndex > pendingNotifyIndex)
  assert.ok(alreadyLiveIndex > 0)
  assert.ok(alreadyLiveIndex < noNewIndex)
})
