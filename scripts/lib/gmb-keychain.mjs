import { execFileSync } from 'node:child_process'

export const GMB_KEYCHAIN_SERVICES = Object.freeze({
  clientId: 'io.mitanios.gmb.client-id',
  clientSecret: 'io.mitanios.gmb.client-secret',
  refreshToken: 'io.mitanios.gmb.refresh-token',
})

export function readGmbKeychainItem(service, {
  account = process.env.USER,
  execFileSyncImpl = execFileSync,
} = {}) {
  if (!account) return ''
  try {
    return String(execFileSyncImpl('/usr/bin/security', [
      'find-generic-password', '-a', account, '-s', service, '-w',
    ], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })).trim()
  } catch {
    return ''
  }
}

export function getGmbKeychainCredentials(options = {}) {
  return {
    clientId: readGmbKeychainItem(GMB_KEYCHAIN_SERVICES.clientId, options),
    clientSecret: readGmbKeychainItem(GMB_KEYCHAIN_SERVICES.clientSecret, options),
    refreshToken: readGmbKeychainItem(GMB_KEYCHAIN_SERVICES.refreshToken, options),
  }
}

export function saveGmbRefreshToken(refreshToken, {
  account = process.env.USER,
  execFileSyncImpl = execFileSync,
} = {}) {
  if (!account || typeof refreshToken !== 'string' || refreshToken.length < 20) {
    throw new Error('refresh_token_invalid')
  }
  execFileSyncImpl('/usr/bin/security', [
    'add-generic-password', '-U',
    '-a', account,
    '-s', GMB_KEYCHAIN_SERVICES.refreshToken,
    '-l', GMB_KEYCHAIN_SERVICES.refreshToken,
    '-w', refreshToken,
  ], { stdio: ['ignore', 'ignore', 'ignore'] })
}
