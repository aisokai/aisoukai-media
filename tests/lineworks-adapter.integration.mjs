import test from 'node:test'
import assert from 'node:assert/strict'
import { createVerify, generateKeyPairSync } from 'node:crypto'
import { buildJwtAssertion, requireLineworksCredentials } from '../scripts/lib/lineworks-adapter.mjs'

test('JWT assertion は RS256 で正しく署名される', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' })
  const jwt = buildJwtAssertion({
    clientId: 'client-1', serviceAccount: 'sa@example', privateKey: pem, now: 1_700_000_000,
  })
  const [header, payload, signature] = jwt.split('.')
  assert.ok(header && payload && signature)

  const decodedPayload = JSON.parse(Buffer.from(payload, 'base64url').toString())
  assert.equal(decodedPayload.iss, 'client-1')
  assert.equal(decodedPayload.sub, 'sa@example')
  assert.equal(decodedPayload.exp - decodedPayload.iat, 3600)

  const verifier = createVerify('RSA-SHA256')
  verifier.update(`${header}.${payload}`)
  const sigBuf = Buffer.from(signature.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
  assert.equal(verifier.verify(publicKey, sigBuf), true)
})

test('LINE WORKS認証情報が未設定なら明示エラーで停止する', () => {
  const keys = ['LW_CLIENT_ID', 'LW_CLIENT_SECRET', 'LW_SERVICE_ACCOUNT', 'LW_PRIVATE_KEY', 'LW_BOT_ID', 'LW_CHANNEL_ID']
  const saved = {}
  for (const key of keys) {
    saved[key] = process.env[key]
    process.env[key] = ''
  }
  try {
    assert.throws(() => requireLineworksCredentials(), /LINE WORKS認証情報/)
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})
