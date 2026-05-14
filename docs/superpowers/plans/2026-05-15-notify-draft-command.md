# notify:draft コマンド実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 指定 slug の下書き生成通知を後から Telegram に再送できる `npm run notify:draft -- <slug>` コマンドを追加する。

**Architecture:** `scripts/notify-draft.mjs` を新規作成し、`content/posts/<slug>.md` の frontmatter を読んで Telegram に通知を送信する。セッション管理は `telegram-ops.mjs` と同じ `data/telegram-session.json` を共用する。既存の通知ロジック（`telegram-ops.mjs` 内インライン）は最小限の共通化にとどめ、独立スクリプトとして完結させる。

**Tech Stack:** Node.js ESM (.mjs), gray-matter, fetch (Node.js built-in), TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID / SITE_URL / NEXT_PUBLIC_SITE_URL

---

## ファイル構成

| 操作 | ファイル | 役割 |
|------|----------|------|
| 新規作成 | `scripts/notify-draft.mjs` | notify:draft コマンド本体 |
| 修正 | `package.json` | `notify:draft` スクリプト追加 |

---

## Task 1: `package.json` に notify:draft を追加

**Files:**
- Modify: `package.json`（scripts セクションに1行追加）

- [ ] **Step 1: scripts に `notify:draft` を追加する**

`package.json` の `"scripts"` ブロックに以下を追加する（既存スクリプトの並び順を崩さないよう、`notify:pending-review` の直後が望ましい）:

```json
"notify:draft": "node scripts/notify-draft.mjs",
```

- [ ] **Step 2: 構文チェック**

```bash
node -e "JSON.parse(require('fs').readFileSync('package.json','utf8'))" && echo "OK"
```

期待出力: `OK`

- [ ] **Step 3: コマンドが認識されることを確認（引数なしでエラー終了することを確認）**

```bash
cd ~/Desktop/aisoukai-media && npm run notify:draft 2>&1 | head -5
```

期待出力: `Missing script "notify:draft"` が出ないこと（スクリプトが存在するがファイルがまだないため Node.js エラーになる、または "使い方:" が表示される）

---

## Task 2: `scripts/notify-draft.mjs` を作成する

**Files:**
- Create: `scripts/notify-draft.mjs`

### 実装仕様（詳細）

#### 引数

| 引数 | 必須 | 説明 |
|------|------|------|
| `<slug>` | ○ | 対象記事の slug（位置引数 or `--slug`）。日付プレフィックスあり・なし両方を解決する |
| `--no-session` | × | 指定時はセッション更新をスキップ |

#### 処理フロー

1. `.env.local` を読み込む
2. 引数を解析して slug を取得（なければ usage を表示して exit 1）
3. `content/posts/<slug>.md` を探索（フルファイル名 → 日付なし slug の部分一致の順で解決）
4. ファイルが存在しない → `エラー: 記事が見つかりません: "<slug>"` を表示して exit 1
5. gray-matter でフロントマターを解析
6. `reviewed: true` の場合:
   - コンソールに `⚠️ すでに承認済みです: <slug>` を表示
   - Telegram にも `⚠️ すでに承認済みです\n\nスラグ: <slug>` を送信
   - セッション更新なし（承認済みなので pending には戻さない）
   - exit 0
7. `reviewed: false` の場合:
   - Telegram に下書き確認通知を送信（HTML parse_mode）
   - `--no-session` がなければ `addSessionPending()` でセッションに登録

#### Telegram 通知内容（HTML）

```
📝 <b>{title}</b>

スラグ: <code>{slug}</code>
カテゴリ: {category}

{excerpt}

<a href="{siteUrl}/admin/pending-review">下書きを確認する</a>

問題なければ「承認」と返信してください。
差し戻しなら「差し戻し」と返信してください。
```

`siteUrl` は `SITE_URL` → `NEXT_PUBLIC_SITE_URL` → `VERCEL_URL` の順で取得（`getSiteUrl()` と同じロジック）。未設定の場合は `/admin/pending-review` をプレーンテキストで表示。

#### セッション管理

`data/telegram-session.json` は `telegram-ops.mjs` と同じスキーマ:

```json
{
  "sessions": {
    "<chatId>": {
      "items": [
        { "slug": "...", "title": "...", "created_at": "...", "status": "pending_approval" }
      ]
    }
  }
}
```

- `TELEGRAM_CHAT_ID` を chatId として使う
- 同一 slug が既存 items にあれば status を `pending_approval` に更新（同じ `addSessionPending` ロジック）
- なければ末尾に追加

- [ ] **Step 1: `scripts/notify-draft.mjs` を作成する**

```js
#!/usr/bin/env node
// notify-draft.mjs
// 指定 slug の下書き生成通知を Telegram に再送する CLI。
// Human がトリガーする。AI が自動実行してはならない。
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import matter from 'gray-matter'

const __dirname     = dirname(fileURLToPath(import.meta.url))
const ROOT          = join(__dirname, '..')
const POSTS_DIR     = join(ROOT, 'content', 'posts')
const SESSION_PATH  = join(ROOT, 'data', 'telegram-session.json')

function loadEnv() {
  const envPath = join(ROOT, '.env.local')
  if (!existsSync(envPath)) return
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.+)$/)
    if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '')
  }
}

function parseArgs(argv) {
  const args = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key  = argv[i].slice(2).replace(/-/g, '_')
      const next = argv[i + 1]
      args[key]  = next && !next.startsWith('--') ? argv[++i] : true
    } else {
      args._.push(argv[i])
    }
  }
  return args
}

function getSiteUrl() {
  const raw = process.env.SITE_URL
    ?? process.env.NEXT_PUBLIC_SITE_URL
    ?? process.env.VERCEL_URL
    ?? ''
  if (!raw) return null
  const cleaned = raw.replace(/\/$/, '')
  return /^https?:\/\//.test(cleaned) ? cleaned : `https://${cleaned}`
}

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function getJstTimestamp() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().replace('Z', '+09:00')
}

// slug → フルファイルパスを解決（日付プレフィックスあり・なし両対応）
const DATE_PREFIX_RE = /^\d{4}-\d{2}-\d{2}-/

function resolveFilePath(input) {
  const name   = input.endsWith('.md') ? input : `${input}.md`
  const direct = join(POSTS_DIR, name)
  if (existsSync(direct)) return direct

  const slug  = input.replace(/\.md$/, '')
  const files = readdirSync(POSTS_DIR).filter((f) => f.endsWith('.md'))
  const hits  = files.filter((f) => f.replace(DATE_PREFIX_RE, '').replace(/\.md$/, '') === slug)

  if (hits.length === 0) return null
  if (hits.length > 1) throw new Error(`スラグ "${slug}" に複数のファイルが一致します: ${hits.join(', ')}`)
  return join(POSTS_DIR, hits[0])
}

// ── セッション管理 ────────────────────────────────────────────────────────

function loadSessions() {
  if (!existsSync(SESSION_PATH)) return { sessions: {} }
  try {
    const parsed = JSON.parse(readFileSync(SESSION_PATH, 'utf8'))
    if (!parsed || typeof parsed.sessions !== 'object' || parsed.sessions === null) {
      return { sessions: {} }
    }
    return parsed
  } catch { return { sessions: {} } }
}

function saveSessions(data) {
  writeFileSync(SESSION_PATH, JSON.stringify(data, null, 2) + '\n', 'utf8')
}

function addSessionPending(chatId, slug, title) {
  const data = loadSessions()
  if (!data.sessions[chatId] || !Array.isArray(data.sessions[chatId].items)) {
    data.sessions[chatId] = { items: [] }
  }
  const items    = data.sessions[chatId].items
  const existing = items.find((i) => i.slug === slug)
  if (existing) {
    existing.status     = 'pending_approval'
    existing.updated_at = getJstTimestamp()
  } else {
    items.push({ slug, title, created_at: getJstTimestamp(), status: 'pending_approval' })
  }
  saveSessions(data)
}

// ── Telegram 送信 ─────────────────────────────────────────────────────────

async function sendTelegram(botToken, chatId, text, parseMode = null) {
  const url  = `https://api.telegram.org/bot${botToken}/sendMessage`
  const body = { chat_id: chatId, text, disable_web_page_preview: false }
  if (parseMode) body.parse_mode = parseMode
  const res  = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })
  const json = await res.json()
  if (!json.ok) throw new Error(`sendMessage エラー: ${json.description ?? JSON.stringify(json)}`)
  return json
}

// ── 通知メッセージ構築 ────────────────────────────────────────────────────

function buildDraftNotification(slug, data, siteUrl) {
  const title    = String(data.title ?? slug)
  const category = String(data.category ?? '（未設定）')
  const excerpt  = String(data.excerpt ?? '（要約なし）')

  const reviewUrl  = siteUrl ? `${siteUrl}/admin/pending-review` : null
  const linkHtml   = reviewUrl
    ? `<a href="${escHtml(reviewUrl)}">下書きを確認する</a>`
    : '/admin/pending-review'

  const lines = [
    `📝 <b>${escHtml(title)}</b>`,
    ``,
    `スラグ: <code>${escHtml(slug)}</code>`,
    `カテゴリ: ${escHtml(category)}`,
    ``,
    escHtml(excerpt),
    ``,
    linkHtml,
    ``,
    `問題なければ「承認」と返信してください。`,
    `差し戻しなら「差し戻し」と返信してください。`,
  ]
  return lines.join('\n')
}

// ── メイン ────────────────────────────────────────────────────────────────

async function main() {
  loadEnv()

  const args      = parseArgs(process.argv.slice(2))
  const slugInput = String(args.slug ?? args._[0] ?? '').trim()
  const noSession = args.no_session === true

  if (!slugInput) {
    console.error('使い方: npm run notify:draft -- <slug>')
    console.error('   例:  npm run notify:draft -- 2026-05-13-cadcam')
    console.error('        npm run notify:draft -- 2026-05-13-cadcam --no-session')
    process.exit(1)
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN
  const chatId   = process.env.TELEGRAM_CHAT_ID

  if (!botToken || !chatId) {
    console.error('エラー: 環境変数が未設定です')
    if (!botToken) console.error('  TELEGRAM_BOT_TOKEN が必要です')
    if (!chatId)   console.error('  TELEGRAM_CHAT_ID が必要です')
    process.exit(1)
  }

  // ファイル解決
  let filePath
  try {
    filePath = resolveFilePath(slugInput)
  } catch (e) {
    console.error(`エラー: ${e.message}`)
    process.exit(1)
  }

  if (!filePath) {
    console.error(`エラー: 記事が見つかりません: "${slugInput}"`)
    console.error('  content/posts/ 以下のスラグを指定してください')
    process.exit(1)
  }

  const slug   = filePath.split('/').pop().replace(/\.md$/, '')
  const raw    = readFileSync(filePath, 'utf8')
  const { data } = matter(raw)

  const BAR = '━'.repeat(56)
  console.log(BAR)
  console.log('notify:draft — 下書き通知再送')
  console.log(BAR)
  console.log(`  スラグ     : ${slug}`)
  console.log(`  タイトル   : ${data.title ?? '（未設定）'}`)
  console.log(`  カテゴリ   : ${data.category ?? '（未設定）'}`)
  console.log(`  reviewed   : ${data.reviewed}`)
  console.log()

  // 承認済みチェック
  if (data.reviewed === true) {
    console.log(`⚠️  すでに承認済みです: ${slug}`)
    console.log()
    await sendTelegram(
      botToken, chatId,
      `⚠️ すでに承認済みです\n\nスラグ: ${slug}\nタイトル: ${String(data.title ?? slug)}`,
    ).catch((e) => {
      console.warn(`Telegram 送信失敗（無視）: ${e.message}`)
    })
    console.log('✅ Telegram に「承認済み」通知を送信しました')
    return
  }

  // 通知送信
  const siteUrl = getSiteUrl()
  const msgText = buildDraftNotification(slug, data, siteUrl)

  console.log('送信内容プレビュー:')
  console.log('─'.repeat(40))
  console.log(
    msgText
      .replace(/<b>(.*?)<\/b>/g, '$1')
      .replace(/<code>(.*?)<\/code>/g, '`$1`')
      .replace(/<a href="[^"]*">([^<]*)<\/a>/g, '$1')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'),
  )
  console.log('─'.repeat(40))
  console.log()

  await sendTelegram(botToken, chatId, msgText, 'HTML')
  console.log('✅ Telegram 通知を送信しました')

  // セッション更新
  if (!noSession) {
    addSessionPending(chatId, slug, String(data.title ?? slug))
    console.log(`✅ セッション更新: ${slug} → pending_approval`)
    console.log(`   chat_id: ${chatId}`)
  } else {
    console.log('ℹ️  --no-session: セッション更新をスキップしました')
  }

  console.log()
  console.log(BAR)
  console.log('完了')
  console.log(BAR)
}

main().catch((e) => {
  console.error('エラー:', e.message)
  process.exit(1)
})
```

- [ ] **Step 2: 構文チェック（Node.js でロードできるか確認）**

```bash
cd ~/Desktop/aisoukai-media && node --input-type=module < /dev/null || true
node -e "import('./scripts/notify-draft.mjs').catch(e => { if (e.code !== 'ERR_MODULE_NOT_FOUND') process.exit(1) })"
```

期待: エラーなし（gray-matter がないとランタイムエラーになるが、import は通る）

より確実な確認:

```bash
cd ~/Desktop/aisoukai-media && node --check scripts/notify-draft.mjs 2>&1 && echo "構文OK"
```

期待出力: `構文OK`

- [ ] **Step 3: 引数なしで usage が表示されることを確認**

```bash
cd ~/Desktop/aisoukai-media && npm run notify:draft 2>&1
```

期待出力（先頭数行）:
```
使い方: npm run notify:draft -- <slug>
   例:  npm run notify:draft -- 2026-05-13-cadcam
```

- [ ] **Step 4: 存在しないスラグでエラー終了することを確認**

```bash
cd ~/Desktop/aisoukai-media && npm run notify:draft -- no-such-slug 2>&1; echo "exit: $?"
```

期待出力:
```
エラー: 記事が見つかりません: "no-such-slug"
exit: 1
```

（TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID が未設定の場合は先に環境変数エラーが出る。その場合は exit 1 の確認のみでよい）

- [ ] **Step 5: 承認済み記事（reviewed: true）でのコンソール出力を確認**

`2026-05-13-cadcam.md` は `reviewed: true` なので:

```bash
cd ~/Desktop/aisoukai-media && npm run notify:draft -- 2026-05-13-cadcam 2>&1 | head -20
```

期待出力（Telegram 環境変数が設定されている場合）:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
notify:draft — 下書き通知再送
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  スラグ     : 2026-05-13-cadcam
  タイトル   : CAD/CAMとは？デジタル技術で作る歯の詰め物・被せ物について
  カテゴリ   : 虫歯治療
  reviewed   : true

⚠️  すでに承認済みです: 2026-05-13-cadcam
```

（Telegram 環境変数が未設定の場合は環境変数エラーで終了する。その場合は `--no-session` は関係ないが、環境変数チェック前に frontmatter チェックをする設計でないため先に環境変数エラーが出ることに注意）

- [ ] **Step 6: コミット**

```bash
cd ~/Desktop/aisoukai-media && git add scripts/notify-draft.mjs package.json && git status
```

---

## Task 3: 実動作確認と最終検証

**Files:**
- 参照: `content/posts/2026-05-13-cadcam.md`（reviewed: true — 承認済みテスト用）
- 参照: `data/telegram-session.json`（セッション更新確認用）

- [ ] **Step 1: `npm run validate:posts` を実行**

```bash
cd ~/Desktop/aisoukai-media && npm run validate:posts
```

期待: 全記事がバリデーションをパス（notify-draft.mjs はコンテンツに影響しないため既存エラーが増えないことを確認）

- [ ] **Step 2: `npm run build` を実行**

```bash
cd ~/Desktop/aisoukai-media && npm run build 2>&1 | tail -20
```

期待: ビルドが成功（`✓ Compiled successfully` 等）

- [ ] **Step 3: git commit を作成**

```bash
cd ~/Desktop/aisoukai-media && git log --oneline -3
```

直近 commit hash を確認してから:

```bash
cd ~/Desktop/aisoukai-media && git add scripts/notify-draft.mjs package.json
git commit -m "feat: add notify:draft command for Telegram draft re-notification"
```

- [ ] **Step 4: git status を確認**

```bash
cd ~/Desktop/aisoukai-media && git status --short --branch
```

期待: クリーン（変更なし）

---

## 自己レビュー

### Spec カバレッジチェック

| 要件 | 対応タスク |
|------|-----------|
| `npm run notify:draft` 追加 | Task 1 |
| 使い方: `npm run notify:draft -- <slug>` | Task 2 (parseArgs) |
| title / slug / category / 要約 | Task 2 (buildDraftNotification) |
| 下書き確認リンク（SITE_URL / NEXT_PUBLIC_SITE_URL） | Task 2 (getSiteUrl + linkHtml) |
| 「承認」「差し戻し」の返信案内 | Task 2 (buildDraftNotification) |
| Telegramでタップ可能なリンク | Task 2 (HTML parse_mode + `<a href>`) |
| 対象記事が存在しない場合はエラー | Task 2 (resolveFilePath + exit 1) |
| reviewed:true → 「すでに承認済み」 | Task 2 (reviewed check) |
| reviewed:false → session に pending_approval 登録 | Task 2 (addSessionPending) |
| --no-session オプション | Task 2 (noSession flag) |
| 既存 draft 通知ロジックとの共通化 | Task 2 (buildDraftNotification を独立関数化) |
| npm run validate:posts | Task 3 Step 1 |
| npm run build | Task 3 Step 2 |
| commit hash / git status | Task 3 Step 3-4 |

### 注意点

- `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` が未設定の場合、ファイル存在確認より前に環境変数エラーになる。これは意図的（通知スクリプトとして環境変数は前提条件）
- セッション更新は `TELEGRAM_CHAT_ID` を chatId として使う（CLI トリガーのため Telegram メッセージ送信者 ID がない）
- `telegram-ops.mjs` 内の既存インライン通知ロジックは変更しない（YAGNI: 共通化は新スクリプトの独立した関数に留める）
