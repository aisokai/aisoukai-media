import { readFileSync } from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'

const actionsRoute = readFileSync('src/app/api/dmp-core/v1/actions/route.ts', 'utf8')
const summaryRoute = readFileSync('src/app/api/dmp-core/v1/actions/summary/route.ts', 'utf8')

function createNextResponse() {
  return { json: (body, init = {}) => ({ body, status: init.status ?? 200 }) }
}

async function loadActionsRoute({ requireAdmin, getAll = () => [], set = () => {} }) {
  const source = actionsRoute
  const modules = {
    'next/server': { NextResponse: createNextResponse() },
    '@/../scripts/lib/dmp-action.mjs': {
      validateActionInput: () => ({ valid: true, errors: [] }),
      createAction: (body) => ({ ok: true, data: { id: 'action-1', status: 'pending', ...body } }),
      createActionTransport: () => ({
        listActions: async () => ({ ok: true, data: getAll() }),
        createAction: async ({ input }) => ({ ok: true, data: { id: 'action-1', status: 'pending', ...input } }),
      }),
    },
    '@/lib/adminAuth': { requireAdmin },
    '@/lib/dmpActionStore': { getAll, set, dmpActionCore: {} },
  }
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const exports = {}
  new Function('require', 'exports', compiled)((specifier) => modules[specifier], exports)
  return exports
}

async function loadSummaryRoute({ requireAdmin, getSummary = () => ({ total: 0 }) }) {
  const source = summaryRoute
  const modules = {
    'next/server': { NextResponse: createNextResponse() },
    '@/../scripts/lib/dmp-action.mjs': {
      createActionTransport: () => ({ getActionSummary: async () => ({ ok: true, data: getSummary() }) }),
    },
    '@/lib/adminAuth': { requireAdmin },
    '@/lib/dmpActionStore': { getSummary, dmpActionCore: {} },
  }
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const exports = {}
  new Function('require', 'exports', compiled)((specifier) => modules[specifier], exports)
  return exports
}

test('DMP actions API rejects unauthenticated GET and POST before request handling', async () => {
  const requireAdmin = async () => { throw new Error('not authenticated') }
  const route = await loadActionsRoute({ requireAdmin })

  const get = await route.GET({ nextUrl: new URL('https://example.invalid/api/dmp-core/v1/actions') })
  let parsed = false
  const post = await route.POST({ json: async () => { parsed = true; return {} } })

  assert.deepEqual(get, { body: { ok: false, error: 'Unauthorized' }, status: 401 })
  assert.deepEqual(post, { body: { ok: false, error: 'Unauthorized' }, status: 401 })
  assert.equal(parsed, false)
})

test('DMP actions API retains successful GET and POST responses for authenticated requests', async () => {
  const saved = []
  const route = await loadActionsRoute({
    requireAdmin: async () => {},
    getAll: () => [{ id: 'action-1', status: 'pending', channel: 'blog', origin_surface: 'aisoukai_admin' }],
    set: (...args) => saved.push(args),
  })

  const get = await route.GET({ nextUrl: new URL('https://example.invalid/api/dmp-core/v1/actions?status=pending') })
  const post = await route.POST({ json: async () => ({ type: 'repo.validate', channel: 'system', origin_surface: 'aisoukai_admin' }) })

  assert.equal(get.status, 200)
  assert.deepEqual(get.body.data.map((action) => action.id), ['action-1'])
  assert.equal(post.status, 200)
  assert.equal(post.body.ok, true)
  // 永続化は transport 側の責務に移ったため、ここでは認証済みPOSTが Action を返すことだけを見る。
  // 保存そのものは scripts/lib/dmp-action-transport.test.mjs が検証する。
  assert.equal(post.body.data.id, 'action-1')
})

test('DMP action summary rejects unauthenticated requests and retains its successful response', async () => {
  const rejectedRoute = await loadSummaryRoute({ requireAdmin: async () => { throw new Error('not authenticated') } })
  const acceptedRoute = await loadSummaryRoute({ requireAdmin: async () => {}, getSummary: () => ({ total: 3 }) })

  assert.deepEqual(await rejectedRoute.GET(), { body: { ok: false, error: 'Unauthorized' }, status: 401 })
  assert.deepEqual(await acceptedRoute.GET(), { body: { ok: true, mode: 'dry-run', data: { total: 3 } }, status: 200 })
})
