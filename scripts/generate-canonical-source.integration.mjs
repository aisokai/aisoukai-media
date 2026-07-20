import { Readable } from 'node:stream'
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  generateCanonicalArticle,
  handleCanonicalRequest,
  main,
  normalizeCanonicalArticle,
  parseRequestText,
} from './generate-canonical-source.mjs'

const request = {
  schema_version: 'blog-canonical-generation-request.v1',
  id: 'topic_0123456789abcdef',
  topic: '子どもの定期検診',
  target_reader: '小学生の保護者',
  keyword: '小児歯科 定期検診',
  publish_date: '2026-07-14',
}

const article = {
  title: '子どもの定期検診で確認すること',
  slug: 'child-dental-checkup',
  bodyHtml: '<h2>定期検診</h2><p>お口の状態を確認します。</p>',
  bodyMarkdown: '## 定期検診\n\nお口の状態を確認します。',
  metaDescription: '子どもの定期検診で確認する内容と、受診時に相談したいポイントを紹介します。',
  categories: ['小児歯科'],
  tags: ['定期検診', '子どもの歯'],
  imageInstruction: '親子が歯科医院で説明を受ける明るいイラスト',
  medicalAdNotes: ['個別の診断や治療方針は歯科医師に相談する。'],
}

test('canonical request accepts the exact bounded schema', () => {
  assert.deepEqual(parseRequestText(JSON.stringify(request)), request)
})

test('canonical provider path accepts an injected client without external calls', async () => {
  const calls = []
  const generated = await generateCanonicalArticle(request, {
    client: {
      chat: {
        completions: {
          create: async (options) => {
            calls.push(options)
            return { choices: [{ message: { content: JSON.stringify(article) } }] }
          },
        },
      },
    },
  })

  assert.deepEqual(generated, article)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].model, 'gpt-5-nano')
  assert.equal(calls[0].max_completion_tokens, 4000)
  assert.equal(calls[0].reasoning_effort, 'minimal')
})

test('canonical request rejects extra fields and path-like input', async () => {
  const extraFieldResult = await handleCanonicalRequest({ ...request, extra: '拒否' })
  assert.equal(extraFieldResult.error_code, 'response_invalid')
  const pathLikeResult = await handleCanonicalRequest({ ...request, topic: '../秘密' })
  assert.deepEqual(pathLikeResult, {
    schema_version: 'blog-canonical-generation-result.v1',
    ok: false,
    error_code: 'response_invalid',
  })
})

test('canonical generation injects a fake generator and returns only the trusted result shape', async () => {
  const seen = []
  const result = await handleCanonicalRequest(request, {
    generateArticle: async (input) => {
      seen.push(input)
      return article
    },
  })

  assert.equal(result.ok, true)
  assert.equal(result.schema_version, 'blog-canonical-generation-result.v1')
  assert.deepEqual(seen, [request])
  const resultArticle = Object.fromEntries(Object.entries(result).filter(([key]) => !['schema_version', 'ok'].includes(key)))
  assert.deepEqual(resultArticle, article)
})

test('canonical CLI writes exactly one structured success object with an injected generator', async () => {
  let output = ''
  const ok = await main({
    stdin: Readable.from([JSON.stringify(request)]),
    stdout: { write: (value) => { output += value } },
    loadEnvironment: () => {},
    generateArticle: async () => article,
  })

  assert.equal(ok, true)
  assert.equal(output.endsWith('\n'), true)
  assert.deepEqual(JSON.parse(output), {
    schema_version: 'blog-canonical-generation-result.v1',
    ok: true,
    ...article,
  })
  assert.equal(output.trim().split('\n').length, 1)
})

test('invalid provider article is sanitized as response_invalid', async () => {
  const result = await handleCanonicalRequest(request, {
    generateArticle: async () => ({ ...article, bodyHtml: '<script>alert(1)</script>' }),
  })
  assert.deepEqual(result, {
    schema_version: 'blog-canonical-generation-result.v1',
    ok: false,
    error_code: 'response_invalid',
  })
})

test('provider article with extra keys is rejected', async () => {
  const result = await handleCanonicalRequest(request, {
    generateArticle: async () => ({ ...article, prompt: 'must not pass through' }),
  })
  assert.equal(result.error_code, 'response_invalid')
})

test('provider failures expose only the allowed error code', async () => {
  const result = await handleCanonicalRequest(request, {
    generateArticle: async () => {
      const error = new Error('provider body must never be exposed')
      error.status = 429
      throw error
    },
  })
  assert.deepEqual(result, {
    schema_version: 'blog-canonical-generation-result.v1',
    ok: false,
    error_code: 'rate_limited',
  })
})

test('canonical article normalizer preserves dmp-content-core field names', () => {
  assert.deepEqual(normalizeCanonicalArticle(article), article)
})

test('request parser rejects oversized and multiple JSON inputs', () => {
  assert.throws(() => parseRequestText('x'.repeat(16 * 1024 + 1)), { code: 'response_invalid' })
  assert.throws(() => parseRequestText(`${JSON.stringify(request)} ${JSON.stringify(request)}`), { code: 'response_invalid' })
})
