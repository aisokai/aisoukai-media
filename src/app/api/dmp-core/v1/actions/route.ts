import { NextRequest, NextResponse } from 'next/server'
import {
  validateActionInput,
  createAction,
} from '@/../scripts/lib/dmp-action.mjs'
import { requireAdmin } from '@/lib/adminAuth'
import { getAll, set } from '@/lib/dmpActionStore'

function jsonResponse(data: unknown, status = 200) {
  return NextResponse.json(data, { status })
}

async function requireAdminResponse() {
  try {
    await requireAdmin()
    return null
  } catch {
    return jsonResponse({ ok: false, error: 'Unauthorized' }, 401)
  }
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminResponse()
  if (unauthorized) return unauthorized

  const { searchParams } = request.nextUrl
  const statusFilter = searchParams.get('status')
  const channelFilter = searchParams.get('channel')
  const originFilter = searchParams.get('origin_surface')

  let actions = getAll()
  if (statusFilter) actions = actions.filter((a) => a.status === statusFilter)
  if (channelFilter) actions = actions.filter((a) => a.channel === channelFilter)
  if (originFilter) actions = actions.filter((a) => a.origin_surface === originFilter)

  return jsonResponse({
    ok: true,
    mode: 'dry-run',
    data: actions,
    message: `${actions.length} 件の Action`,
  })
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminResponse()
  if (unauthorized) return unauthorized

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return jsonResponse(
      { ok: false, mode: 'dry-run', errors: ['JSON パースに失敗しました'] },
      400,
    )
  }

  if (!body || typeof body !== 'object') {
    return jsonResponse(
      { ok: false, mode: 'dry-run', errors: ['リクエストボディが不正です'] },
      400,
    )
  }

  const validation = validateActionInput(body)
  if (!validation.valid) {
    return jsonResponse({ ok: false, mode: 'dry-run', errors: validation.errors }, 400)
  }

  const result = createAction(body)
  if (!result.ok) {
    return jsonResponse({ ok: false, mode: 'dry-run', errors: result.errors }, 400)
  }

  const action = result.data as { id: string; status: string; [key: string]: unknown }
  set(action.id, { ...action, type: String(action.type), channel: String(action.channel), origin_surface: String(action.origin_surface) })

  return jsonResponse({
    ok: true,
    mode: 'dry-run',
    data: action,
    message: `Action ${action.id} を作成しました (status: ${action.status})`,
  })
}
