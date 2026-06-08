'use server'

import { redirect } from 'next/navigation'
import { setAdminSession } from '@/lib/adminAuth'

export type LoginState = {
  ok: boolean
  message: string
}

export async function loginAdmin(_: LoginState, formData: FormData): Promise<LoginState> {
  const password = String(formData.get('password') ?? '')
  const expected = process.env.ADMIN_REVIEW_PASSWORD

  if (!expected) {
    return { ok: false, message: 'ADMIN_REVIEW_PASSWORD が未設定です' }
  }

  if (password !== expected) {
    return { ok: false, message: 'パスコードが違います' }
  }

  await setAdminSession()
  redirect('/admin/pending-review')
}
