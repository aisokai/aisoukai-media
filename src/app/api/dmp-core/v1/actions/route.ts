import { NextRequest, NextResponse } from 'next/server'
import {
  createActionTransport,
} from '@/../scripts/lib/dmp-action.mjs'
import { dmpActionCore } from '@/lib/dmpActionStore'

const transport = createActionTransport({ core: dmpActionCore })

function jsonResponse(data: unknown, status = 200) {
  return NextResponse.json(data, { status })
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const statusFilter = searchParams.get('status')
  const channelFilter = searchParams.get('channel')
  const originFilter = searchParams.get('origin_surface')

  const result = await transport.listActions({
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(channelFilter ? { channel: channelFilter } : {}),
    ...(originFilter ? { origin_surface: originFilter } : {}),
  })

  if (!result.ok) {
    return jsonResponse({ ok: false, mode: 'dry-run', errors: result.errors ?? ['Action の取得に失敗しました'] }, 400)
  }

  const actions = Array.isArray(result.data) ? result.data : []

  return jsonResponse({
    ok: true,
    mode: 'dry-run',
    data: actions,
    message: `${actions.length} 件の Action`,
  })
}

export async function POST(request: NextRequest) {
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

  const result = await transport.createAction({ input: body })
  if (!result.ok) {
    return jsonResponse({ ok: false, mode: 'dry-run', errors: result.errors ?? ['Action の作成に失敗しました'] }, 400)
  }

  const action = result.data as { id: string; status: string; [key: string]: unknown }

  return jsonResponse({
    ok: true,
    mode: 'dry-run',
    data: action,
    message: `Action ${action.id} を作成しました (status: ${action.status})`,
  })
}
