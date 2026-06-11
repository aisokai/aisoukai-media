#!/usr/bin/env node
// Media Automation 本番Activation 進行状況の自己診断。
// 各Stageの達成状況を判定し、次に実行すべきコマンドを1つ提示する。
// 認証情報は「存在するか」のbooleanのみ判定し、**値は一切表示しない**。外部通信なし。
//
// 使い方: npm run media:activation

import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { ROOT, listJobs, loadGateConfig } from './lib/media-queue.mjs'
import { getGmbCredentials } from './lib/gmb-api.mjs'
import { DEFAULT_JOBS } from './setup-launchd-media.mjs'

const PLIST_DIR = join(homedir(), 'Library', 'LaunchAgents')

function defaultLaunchdStatus(label) {
  const result = spawnSync('launchctl', ['print', `gui/${process.getuid()}/${label}`], { stdio: 'pipe', encoding: 'utf8' })
  return result.status === 0
}

function defaultLaunchdReady(plistDir = PLIST_DIR, root = ROOT, launchdStatus = defaultLaunchdStatus) {
  return DEFAULT_JOBS.every((job) => {
    const path = join(plistDir, `${job.label}.plist`)
    if (!existsSync(path)) return false
    const content = readFileSync(path, 'utf8')
    if (!content.includes(root)) return false
    if (/--apply|--notify|\bgmb-apply\b|\blineworks-notify\b|\bpublish\b|\bpush\b|\bdeploy\b/.test(content)) return false
    return launchdStatus(job.label)
  })
}

// 各チェックは { ok, label, next, guidance } を返す。next = 未達のとき先生が実行するコマンド。
export function buildActivationChecks({
  config = loadGateConfig(),
  credentials = getGmbCredentials(),
  root = ROOT,
  plistDir = PLIST_DIR,
  jobs = listJobs(),
  launchdStatus = defaultLaunchdStatus,
} = {}) {
  const creds = credentials
  const agentsMd = existsSync(join(root, 'AGENTS.md')) ? readFileSync(join(root, 'AGENTS.md'), 'utf8') : ''

  const hasClient = Boolean(creds.clientId && creds.clientSecret)
  const hasRefresh = Boolean(creds.refreshToken)
  const hasLocation = existsSync(join(root, 'config', 'gmb-location.json'))
  const agentsV2 = /Media Queue/.test(agentsMd)
  const launchdDefault = defaultLaunchdReady(plistDir, root, launchdStatus)

  return [
    {
      stage: '1-1/1-2a', ok: hasClient,
      label: 'GMB OAuthクライアント設定 (GMB_CLIENT_ID / GMB_CLIENT_SECRET)',
      next: 'docs/gmb-oauth-setup-guide.md Step 1-3 を実施し .env.local に設定',
      guidance: [
        'Google Cloud ConsoleでGBP API承認済みプロジェクトを選びます',
        'OAuthクライアントは「デスクトップアプリ」で作成します',
        'client id / client secret は .env.local に保存し、この画面・チャットには表示しません',
        '保存後の再開: npm run media:activation',
      ],
    },
    {
      stage: '1-2b', ok: hasRefresh,
      label: 'GMB refresh token (.env.local / 値は表示しません)',
      next: 'npm run media:gmb:auth -- --url → ブラウザ承認 → npm run media:gmb:auth -- --exchange <code> --write-env',
      guidance: [
        'ブラウザではGMB管理者のGoogleアカウントを選びます',
        'business.manage scopeを承認し、表示されたcodeだけをCLIへ渡します',
        '--write-env は refresh token を .env.local に保存し、stdoutには表示しません',
        '認証後の確認: npm run media:activation',
      ],
    },
    {
      stage: '1-3', ok: hasLocation,
      label: 'GMB location設定 (config/gmb-location.json)',
      next: 'npm run media:gmb:discover',
      guidance: [
        '読み取り専用でaccount/locationを取得します',
        '1件だけなら config/gmb-location.json に自動保存します',
        '複数ある場合は表示された --save コマンドで対象医院を選びます',
        'config/gmb-location.json はgitignore済みのローカル設定です',
      ],
    },
    {
      stage: '1-4', ok: hasClient && hasRefresh && hasLocation,
      label: '実API読み取りテスト可能',
      next: 'npm run media:gmb:reviews:check -- --source api',
      guidance: [
        'GMB口コミのread-only取得だけを行います',
        '新規口コミがあれば返信案とqueueをローカル生成します',
        'GMB返信・投稿の実送信はこのコマンドからは起きません',
      ],
    },
    {
      stage: '1-5', ok: launchdDefault,
      label: 'launchd 日次稼働 (read-only/dry-runジョブ)',
      next: 'npm run media:launchd:install',
      guidance: [
        'default installはread-only/dry-run/ローカル記録のみです',
        'default plistに --apply / --notify / publish / push / deploy は含めません',
        'install後はplist存在だけでなくlaunchctl load状態も確認します',
        '確認: npm run media:launchd:status',
      ],
    },
    {
      stage: '2-0', ok: agentsV2,
      label: 'AGENTS.md v2 適用 (Telegram Media Queue承認の解禁)',
      next: 'docs/agents-md-v2-proposal.md の差分を先生がAGENTS.mdへ反映',
    },
    {
      stage: '2-1', ok: config?.flags?.telegram_media_approve === true,
      label: 'Telegram承認フラグ (telegram_media_approve)',
      next: 'AGENTS.md v2適用後、config/media-gate.json で telegram_media_approve: true (先生のみ)',
    },
    {
      stage: '2-*', ok: jobs.some((j) => j.status === 'executed'),
      label: '承認付きapplyの実績 (executed job が1件以上)',
      next: '/review → /approve <mj-id> → npm run media:gmb:apply -- <mj-id> --apply',
    },
    {
      stage: '3-2', ok: config?.flags?.gmb_reply_auto_template === true,
      label: '低リスク自動返信 (テンプレ) — 任意・Stage 3',
      next: 'executor dry-runログ2週間観察後に gmb_reply_auto_template: true (先生のみ)',
    },
  ]
}

export function findNextAction(checks) {
  return checks.find((c) => !c.ok) ?? null
}

function main() {
  const checks = buildActivationChecks()
  console.log('🚀 Media Automation Activation 進行状況')
  console.log('━'.repeat(56))
  for (const check of checks) {
    console.log(` ${check.ok ? '✅' : '⬜'} [Stage ${check.stage}] ${check.label}`)
  }
  console.log('━'.repeat(56))
  const next = findNextAction(checks)
  if (!next) {
    console.log('🎉 全Stage完了。低リスク自動返信まで解放済みです。')
    return
  }
  console.log(`▶ 次のアクション [Stage ${next.stage}]:`)
  console.log(`   ${next.next}`)
  if (next.guidance?.length) {
    console.log('   確認:')
    for (const line of next.guidance) console.log(`   - ${line}`)
  }
  console.log('   手順全体: docs/media-automation-activation-runbook.md')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
