import { NextResponse } from 'next/server'
import { createActionTransport } from '@/../scripts/lib/dmp-action.mjs'
import { dmpActionCore } from '@/lib/dmpActionStore'

const transport = createActionTransport({ core: dmpActionCore })

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let body: { to_status?: unknown; expected_snapshot_hash?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, mode: 'dry-run', errors: ['JSON パースに失敗しました'] }, { status: 400 })
  }

  const { id } = await params
  const to_status = typeof body?.to_status === 'string' ? body.to_status : ''
  const expected_snapshot_hash = typeof body?.expected_snapshot_hash === 'string' ? body.expected_snapshot_hash : ''
  const result = await transport.transitionAction({ id, to_status, expected_snapshot_hash })
  if (!result.ok) {
    return NextResponse.json({ ok: false, mode: 'dry-run', errors: result.errors ?? ['Action の状態遷移に失敗しました'] }, { status: 400 })
  }

  return NextResponse.json({ ok: true, mode: 'dry-run', data: result.data })
}
