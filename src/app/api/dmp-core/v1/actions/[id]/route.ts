import { NextResponse } from 'next/server'
import { createActionTransport } from '@/../scripts/lib/dmp-action.mjs'
import { dmpActionCore } from '@/lib/dmpActionStore'

const transport = createActionTransport({ core: dmpActionCore })

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const result = await transport.getAction({ id })
  if (!result.ok) {
    return NextResponse.json({ ok: false, mode: 'dry-run', errors: result.errors ?? ['Action が見つかりません'] }, { status: 404 })
  }

  return NextResponse.json({ ok: true, mode: 'dry-run', data: result.data })
}
