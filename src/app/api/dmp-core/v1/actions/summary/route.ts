import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { getSummary } from '@/lib/dmpActionStore'

export async function GET() {
  try {
    await requireAdmin()
  } catch {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  return NextResponse.json({
    ok: true,
    mode: 'dry-run',
    data: getSummary(),
  })
}
