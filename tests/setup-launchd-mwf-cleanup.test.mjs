import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CONFIG_PATH = resolve(ROOT, 'config/media-gate.json')
const SETUP_PATH = resolve(ROOT, 'scripts/setup-launchd-mwf.mjs')

test('launchd cleanup keeps Telegram notifications off and normal generation copy aligned', () => {
  const mediaGate = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'))
  const setupSource = readFileSync(SETUP_PATH, 'utf8')

  assert.equal(mediaGate.flags.telegram_notify, false)
  assert.match(setupSource, /const MEDIA_GATE_PATH = join\(ROOT, 'config', 'media-gate\.json'\)/)
  assert.match(setupSource, /function readTelegramNotifyGate\(\)/)
  assert.match(setupSource, /JSON\.parse\(readFileSync\(MEDIA_GATE_PATH, 'utf8'\)\)/)
  assert.match(setupSource, /typeof config\.flags\.telegram_notify !== 'boolean'/)
  assert.match(setupSource, /catch \{\s*return \{ enabled: false, valid: false \}/)
  assert.match(setupSource, /function telegramEnvironmentXml\(gate\)/)
  assert.match(setupSource, /if \(gate\.enabled === true\) return ''/)
  assert.match(setupSource, /<key>EnvironmentVariables<\/key>/)
  assert.match(setupSource, /<key>TELEGRAM_BOT_TOKEN<\/key>\s*<string><\/string>/)
  assert.match(setupSource, /<key>TELEGRAM_CHAT_ID<\/key>\s*<string><\/string>/)
  assert.match(setupSource, /const telegramGate = readTelegramNotifyGate\(\)/)
  assert.match(setupSource, /\$\{telegramEnvironmentXml\(telegramGate\)\}/)
  assert.match(setupSource, /const telegramEnvDisabled = \/<key>EnvironmentVariables/)
  assert.match(setupSource, /const notificationsOff = telegramGate\.enabled !== true && telegramEnvDisabled/)
  assert.match(setupSource, /telegram_notify=\$\{telegramGate\.enabled \? 'true' : 'false'\}/)
  assert.match(setupSource, /media-gate 読込\/検証失敗（fail-closed）/)
  assert.match(
    setupSource,
    /<string>\$\{NODE_BIN\}<\/string>\s*<string>\$\{SCRIPT_PATH\}<\/string>\s*<string>--force<\/string>/,
  )
  assert.doesNotMatch(setupSource, /<string>--dry-run<\/string>/)
  assert.match(
    setupSource,
    /const normalMode = progArgs\.includes\('--force'\) && !progArgs\.includes\('--dry-run'\)/,
  )
  assert.match(
    setupSource,
    /console\.log\(`  実行モード: \$\{normalMode \? '✅ 通常生成（--force、Git preflight・Human reviewあり）' : '❌ 想定外の引数'\}`\)/,
  )
  assert.match(setupSource, /Telegram通知: .*無効（\$\{telegramBoundary\} \/ Telegram環境変数を空に固定）/)
  assert.match(
    setupSource,
    /console\.log\('    → npm run ops:mwf:install で通常モードのジョブへ更新してください'\)/,
  )
  assert.match(setupSource, /npm run ops:mwf:install\s+— launchd に登録（月水金 08:30 通常生成）/)
  assert.doesNotMatch(setupSource, /npm run ops:mwf:install[^\n]*dry-run/)
})

test('launchd setup source keeps the Human-only execution boundary', () => {
  const setupSource = readFileSync(SETUP_PATH, 'utf8')

  assert.match(setupSource, /^\/\/ Human が手動で実行する。AI が自動実行してはならない。$/m)
})
