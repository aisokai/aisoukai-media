import { NextResponse } from 'next/server'
import { getSummary } from '@/lib/dmpActionStore'

export async function GET() {
  return NextResponse.json({
    ok: true,
    mode: 'dry-run',
    data: getSummary(),
  })
}
