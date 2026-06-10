import { readFileSync } from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'

test('telegram ops launchd install does not run build or push', () => {
  const source = readFileSync('scripts/setup-launchd-telegram-ops.mjs', 'utf8')

  assert.match(source, /npm run telegram:ops -- --apply/)
  assert.doesNotMatch(source, /npm run telegram:ops -- --apply --build/)
  assert.match(source, /Human Gate/)
})

