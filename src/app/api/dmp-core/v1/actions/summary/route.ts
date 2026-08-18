import { NextResponse } from 'next/server'
import { createActionTransport } from '@/../scripts/lib/dmp-action.mjs'
import { dmpActionCore } from '@/lib/dmpActionStore'

const transport = createActionTransport({ core: dmpActionCore })

export async function GET() {
  const result = await transport.getActionSummary()
  if (!result.ok) {
    return NextResponse.json({ ok: false, mode: 'dry-run', errors: result.errors ?? ['Action 集計の取得に失敗しました'] }, { status: 400 })
  }

  return NextResponse.json({
    ok: true,
    mode: 'dry-run',
    data: result.data,
  })
}
