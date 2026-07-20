import test from 'node:test'
import assert from 'node:assert/strict'

import {
  OPENAI_MODEL,
  createOpenAIClient,
  generateBlogArticleText,
} from './openai-blog-generator.mjs'

test('createOpenAIClient disables SDK retries', () => {
  const previousApiKey = process.env.OPENAI_API_KEY
  let receivedOptions
  class FakeOpenAI {
    constructor(options) {
      receivedOptions = options
    }
  }

  process.env.OPENAI_API_KEY = 'test-key'
  try {
    const client = createOpenAIClient({ clientConstructor: FakeOpenAI })
    assert.ok(client instanceof FakeOpenAI)
    assert.deepEqual(receivedOptions, { apiKey: 'test-key', maxRetries: 0 })
  } finally {
    if (previousApiKey === undefined) delete process.env.OPENAI_API_KEY
    else process.env.OPENAI_API_KEY = previousApiKey
  }
})

test('generateBlogArticleText uses the shared low-cost OpenAI model', async () => {
  const calls = []
  const client = {
    chat: {
      completions: {
        create: async (request) => {
          calls.push(request)
          return {
            choices: [{ message: { content: '  本文  ' } }],
            usage: { prompt_tokens: 3, completion_tokens: 2 },
          }
        },
      },
    },
  }

  const result = await generateBlogArticleText({ prompt: 'テスト', client })
  assert.equal(result.body, '本文')
  assert.equal(calls[0].model, OPENAI_MODEL)
  assert.equal(calls[0].max_completion_tokens, 4000)
  assert.equal(calls[0].reasoning_effort, 'minimal')
})

test('generateBlogArticleText rejects an empty provider response', async () => {
  await assert.rejects(
    () => generateBlogArticleText({
      prompt: 'テスト',
      client: { chat: { completions: { create: async () => ({ choices: [], usage: {} }) } } },
    }),
    { code: 'response_invalid' },
  )
})
