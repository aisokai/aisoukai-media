import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildSafeTemplateThemePrompt,
  classifyTelegramMessage,
} from './telegram-request-routing.mjs'

test('短い定型依頼は request として扱う', () => {
  assert.deepEqual(classifyTelegramMessage('ブログ書いて'), {
    type: 'request',
    requestMode: 'template',
    text: 'ブログ書いて',
  })

  assert.deepEqual(classifyTelegramMessage('記事書いて'), {
    type: 'request',
    requestMode: 'template',
    text: '記事書いて',
  })

  assert.deepEqual(classifyTelegramMessage('投稿作って'), {
    type: 'request',
    requestMode: 'template',
    text: '投稿作って',
  })
})

test('approve/reject は request 判定より優先する', () => {
  assert.deepEqual(classifyTelegramMessage('approve ブログ書いて'), {
    type: 'approve',
    slug: 'ブログ書いて',
    reviewedBy: '',
  })

  assert.deepEqual(classifyTelegramMessage('reject ブログ書いて'), {
    type: 'reject',
    slug: 'ブログ書いて',
    reason: '',
  })
})

test('定型依頼では安全な一般歯科啓発テーマを選ばせるプロンプトを使う', () => {
  const prompt = buildSafeTemplateThemePrompt('ブログ書いて')
  assert.match(prompt, /一般歯科啓発/)
  assert.match(prompt, /安全/)
  assert.match(prompt, /テーマ/)
})
