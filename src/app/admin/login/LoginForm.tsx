'use client'

import { useActionState } from 'react'
import { loginAdmin, type LoginState } from './actions'

const initialState: LoginState = { ok: true, message: '' }

export default function LoginForm({ returnTo }: { returnTo?: string }) {
  const [state, formAction, pending] = useActionState(loginAdmin, initialState)

  return (
    <form action={formAction} className="w-full rounded-2xl bg-white p-6 shadow-sm">
      <h1 className="text-lg font-bold text-gray-900">管理画面ログイン</h1>
      <p className="mt-2 text-sm leading-relaxed text-gray-500">
        承認・却下を行うには管理用パスコードを入力してください。
      </p>
      {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}
      <label className="mt-5 block">
        <span className="sr-only">管理用パスコード</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-base focus:border-[#1e3a5f] focus:outline-none"
          placeholder="パスコード"
          required
        />
      </label>
      {!state.ok && (
        <p aria-live="polite" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
          {state.message}
        </p>
      )}
      <button
        disabled={pending}
        className="mt-4 w-full rounded-xl bg-[#1e3a5f] px-4 py-3 font-bold text-white disabled:cursor-not-allowed disabled:bg-gray-400"
      >
        {pending ? '確認中...' : 'ログイン'}
      </button>
    </form>
  )
}
