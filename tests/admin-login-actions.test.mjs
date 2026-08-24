import { readFileSync } from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'

const loginActions = readFileSync('src/app/admin/login/actions.ts', 'utf8')

test('admin login hashes both passwords to a fixed length before timing-safe comparison', () => {
  assert.match(loginActions, /import \{ createHash, timingSafeEqual \} from 'node:crypto'/)
  assert.match(loginActions, /function passwordsMatch\(candidate: string, expected: string\)/)
  assert.match(loginActions, /createHash\('sha256'\)\.update\(candidate\)\.digest\(\)/)
  assert.match(loginActions, /createHash\('sha256'\)\.update\(expected\)\.digest\(\)/)
  assert.match(loginActions, /timingSafeEqual\(candidateHash, expectedHash\)/)
  assert.match(loginActions, /const passwordMatches = passwordsMatch\(password \?\? '', expected\)/)
  assert.match(loginActions, /if \(password === null \|\| !passwordMatches\)/)
  assert.doesNotMatch(loginActions, /password !== expected/)
})

test('admin login retains the success session and failed-password response paths', () => {
  assert.match(loginActions, /await setAdminSession\(\)/)
  assert.match(loginActions, /redirect\(returnTo \?\? '\/admin'\)/)
  assert.match(loginActions, /message: 'パスコードが違います'/)
})
