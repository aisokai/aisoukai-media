import { readFileSync } from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { loadAdminArticleTopics } from '../src/lib/articleTopics.ts'

const ARTICLE_TOPICS_CSV_HEADER = 'id,discovered_at,source_type,source_url,topic,title_candidate,category,target_keyword,patient_intent,priority,medical_risk,status,publish_date,notes'

function articleTopicsCsv(rows) {
  return `${ARTICLE_TOPICS_CSV_HEADER}\n${rows.join('\n')}\n`
}

function articleTopicCsvRow(id, title = id) {
  return `${id},2026-08-01,clinic,,${title},${title},その他,keyword,intent,medium,low,approved,2026-08-01,`
}

function loadFunctionBody(source, functionName) {
  const functionStart = source.indexOf(`function ${functionName}`)
  assert.notEqual(functionStart, -1, `${functionName} must exist`)
  const bodyStart = source.indexOf('{', functionStart)
  let depth = 0

  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1
    if (source[index] === '}') depth -= 1
    if (depth === 0) return source.slice(bodyStart + 1, index)
  }

  assert.fail(`${functionName} must have a complete body`)
}

test('admin dashboard links all management tools', () => {
  const dashboard = readFileSync('src/app/admin/page.tsx', 'utf8')
  const loginAction = readFileSync('src/app/admin/login/actions.ts', 'utf8')

  assert.match(dashboard, /href="\/admin\/pending-review"/)
  assert.match(dashboard, /href=\{`\/admin\/topic-candidates\?month=/)
  assert.match(dashboard, /href="\/admin\/article-topics"/)
  assert.match(dashboard, /href="\/admin\/posts"/)
  assert.doesNotMatch(dashboard, /準備中/)
  assert.match(loginAction, /redirect\(returnTo \?\? '\/admin'\)/)
})

test('admin login returnTo is preserved only after fail-closed server validation', () => {
  const loginAction = readFileSync('src/app/admin/login/actions.ts', 'utf8')
  const loginForm = readFileSync('src/app/admin/login/LoginForm.tsx', 'utf8')
  const loginPage = readFileSync('src/app/admin/login/page.tsx', 'utf8')
  const dashboard = readFileSync('src/app/admin/page.tsx', 'utf8')
  const topicCandidates = readFileSync('src/app/admin/topic-candidates/page.tsx', 'utf8')

  assert.match(loginAction, /formData\.getAll\('returnTo'\)/)
  assert.match(loginAction, /returnToValues\.length === 1/)
  assert.match(loginAction, /formData\.getAll\('password'\)/)
  assert.match(loginAction, /passwordValues\.length === 1/)
  assert.match(loginAction, /typeof passwordValues\[0\] === 'string'/)
  assert.match(loginAction, /import \{ createHash, timingSafeEqual \} from 'node:crypto'/)
  assert.match(loginAction, /const candidateHash = createHash\('sha256'\)\.update\(candidate\)\.digest\(\)/)
  assert.match(loginAction, /const expectedHash = createHash\('sha256'\)\.update\(expected\)\.digest\(\)/)
  assert.match(loginAction, /timingSafeEqual\(candidateHash, expectedHash\)/)
  assert.match(loginAction, /const passwordMatches = passwordsMatch\(password \?\? '', expected\)/)
  assert.match(loginAction, /password === null \|\| !passwordMatches/)
  assert.match(loginAction, /typeof value !== 'string'/)
  assert.match(loginAction, /MAX_RETURN_TO_LENGTH = 2048/)
  assert.match(loginAction, /decodeURIComponent\(value\)/)
  assert.match(loginAction, /new URL\(value, ADMIN_RETURN_TO_ORIGIN\)/)
  assert.match(loginAction, /target\.origin !== ADMIN_RETURN_TO_ORIGIN/)
  assert.match(loginAction, /target\.pathname !== '\/admin'/)
  assert.match(loginAction, /!target\.pathname\.startsWith\('\/admin\/'\)/)
  assert.match(loginAction, /pathPart\.includes\('%'\)/)
  assert.match(loginAction, /part === '\.' \|\| part === '\.\.'/)
  assert.match(loginAction, /value\.startsWith\('\/\/'\)/)
  assert.match(loginAction, /redirect\(returnTo \?\? '\/admin'\)/)

  assert.match(loginPage, /returnTo\?: string \| string\[\]/)
  assert.match(loginPage, /normalizeAdminReturnTo\(params\?\.returnTo\)/)
  assert.match(loginPage, /isAdminAuthenticated\(\)/)
  assert.match(loginPage, /redirect\(returnTo \?\? '\/admin'\)/)
  assert.match(loginForm, /type="hidden" name="returnTo" value=\{returnTo\}/)
  assert.match(loginForm, /<label className="mt-5 block">/)
  assert.match(loginForm, /<span className="sr-only">管理用パスコード<\/span>/)
  assert.match(dashboard, /\/admin\/login\?returnTo=\$\{encodeURIComponent\(returnTo\)\}/)
  assert.match(topicCandidates, /\/admin\/login\?returnTo=\$\{encodeURIComponent\(returnTo\)\}/)
  assert.match(topicCandidates, /new URLSearchParams\(\{ month, \.\.\.filters \}\)/)

  const normalizeAdminReturnTo = Function(
    'ADMIN_RETURN_TO_ORIGIN',
    'MAX_RETURN_TO_LENGTH',
    `return function (value) {${loadFunctionBody(loginAction, 'normalizeAdminReturnTo')}}`,
  )('https://admin.invalid', 2048)
  const allowed = [
    '/admin',
    '/admin/',
    '/admin/topic-candidates?month=2026-07&status=selected',
    '/admin/topic-candidates?note=%E6%AD%A3',
  ]
  const rejected = [
    null,
    undefined,
    {},
    '',
    ' /admin',
    '/admin\n',
    'https://evil.example/admin',
    '//evil.example/admin',
    '/\\evil.example/admin',
    '/administrator',
    '/administer',
    '/admin/../outside',
    '/admin/%2e%2e/outside',
    '/%2f%2fevil.example',
    '/admin?bad=%ZZ',
    `/admin?value=${'x'.repeat(2048)}`,
  ]

  for (const value of allowed) assert.equal(normalizeAdminReturnTo(value), value)
  for (const value of rejected) assert.equal(normalizeAdminReturnTo(value), null)
})

test('admin management additions keep publishing and review authorization boundaries closed', () => {
  const loginAction = readFileSync('src/app/admin/login/actions.ts', 'utf8')
  const loginPage = readFileSync('src/app/admin/login/page.tsx', 'utf8')
  const dashboard = readFileSync('src/app/admin/page.tsx', 'utf8')
  const topicCandidates = readFileSync('src/app/admin/topic-candidates/page.tsx', 'utf8')
  const ownedAdminSources = [loginAction, loginPage, dashboard, topicCandidates].join('\n')

  assert.match(loginAction, /passwordValues\.length === 1/)
  assert.match(loginAction, /await setAdminSession\(\)[\s\S]*redirect\(returnTo \?\? '\/admin'\)/)
  assert.doesNotMatch(ownedAdminSources, /export\s+(?:async\s+)?function\s+\w*(?:approve|publish)\w*/i)
  assert.doesNotMatch(ownedAdminSources, /fetch\(\s*['"`]\/api\/(?:approve|publish)/i)
  assert.doesNotMatch(ownedAdminSources, /redirect\(\s*['"`]\/api\/(?:approve|publish)/i)
})

test('admin month navigation validates input, rolls years over, and remains mobile accessible', () => {
  const dashboard = readFileSync('src/app/admin/page.tsx', 'utf8')
  const topicCandidates = readFileSync('src/app/admin/topic-candidates/page.tsx', 'utf8')

  for (const page of [dashboard, topicCandidates]) {
    assert.match(page, /\^\\d\{4\}-\(0\[1-9\]\|1\[0-2\]\)\$/)
    assert.match(page, /monthNumber === 1 && offset === -1/)
    assert.match(page, /monthNumber === 12 && offset === 1/)
    assert.match(page, /String\(nextYear\)\.padStart\(4, '0'\)/)
    assert.match(page, /String\(nextMonth\)\.padStart\(2, '0'\)/)
    assert.match(page, /aria-label="対象月を変更"/)
    assert.match(page, /grid-cols-1/)
    assert.match(page, /sm:grid-cols-2/)
    assert.match(page, /min-h-11 w-full/)
    assert.match(page, /← 前月/)
    assert.match(page, /次月.*→/)
  }

  assert.match(dashboard, /requestedMonth \? null : await getMonthlyTopicCandidatesForAdmin/)
  assert.match(topicCandidates, /if \(!file\)[\s\S]*<MonthNavigation month=\{month\} filters=\{filters\} \/>/)
  assert.match(topicCandidates, /status: statusFilter/)
  assert.match(topicCandidates, /risk: riskFilter/)
  assert.match(topicCandidates, /duplicate: duplicateFilter/)
  assert.match(topicCandidates, /priority: priorityFilter/)
  assert.match(topicCandidates, /sort,/)
  assert.match(topicCandidates, /href=\{buildTopicCandidateHref\(previousMonth, filters\)\}/)
  assert.match(topicCandidates, /href=\{buildTopicCandidateHref\(nextMonth, filters\)\}/)

  for (const page of [dashboard, topicCandidates]) {
    const normalizeMonth = Function(`return function (value) {${loadFunctionBody(page, 'normalizeMonth')}}`)()
    const shiftMonth = Function(`return function (month, offset) {${loadFunctionBody(page, 'shiftMonth')}}`)()

    assert.equal(normalizeMonth('2026-01'), '2026-01')
    assert.equal(normalizeMonth('2026-12'), '2026-12')
    assert.equal(normalizeMonth('2026-00'), null)
    assert.equal(normalizeMonth('2026-13'), null)
    assert.equal(normalizeMonth('26-01'), null)
    assert.equal(normalizeMonth(['2026-01', '2026-02']), null)
    assert.equal(shiftMonth('2026-01', -1), '2025-12')
    assert.equal(shiftMonth('2026-12', 1), '2027-01')
    assert.equal(shiftMonth('2026-06', -1), '2026-05')
    assert.equal(shiftMonth('2026-06', 1), '2026-07')
  }
})

test('public header exposes a password-gated admin entry point', () => {
  const header = readFileSync('src/components/Header.tsx', 'utf8')

  assert.match(header, /href="\/admin"/)
  assert.match(header, /管理/)
})

test('admin dashboard metric cards link to filtered management pages', () => {
  const dashboard = readFileSync('src/app/admin/page.tsx', 'utf8')

  assert.match(dashboard, /href="\/admin\/pending-review\?status=pending"/)
  assert.match(dashboard, /href="\/admin\/pending-review\?status=rejected"/)
  assert.match(dashboard, /href=\{`\/admin\/topic-candidates\?month=.*status=selected`/)
  assert.match(dashboard, /href="\/admin\/article-topics\?status=approved"/)
})

test('post management exposes edit, archive, restore, and delete actions', () => {
  const page = readFileSync('src/app/admin/posts/page.tsx', 'utf8')
  const actions = readFileSync('src/app/admin/posts/actions.ts', 'utf8')
  const editor = readFileSync('src/app/admin/posts/[slug]/edit/page.tsx', 'utf8')

  assert.match(page, /記事管理/)
  assert.match(page, /PostManagementActions/)
  assert.match(page, /searchParams/)
  assert.match(page, /statusFilter/)
  assert.match(page, /sortPostsForAdmin/)
  assert.match(page, /stockFilter/)
  assert.match(page, /generated_at/)
  assert.match(page, /duplicateOf/)
  assert.match(editor, /PostMarkdownEditor/)
  assert.match(actions, /savePostMarkdownAction/)
  assert.match(actions, /archivePostAction/)
  assert.match(actions, /restorePostAction/)
  assert.match(actions, /deletePostAction/)
  assert.match(actions, /admin-post-history\.md/)
})

test('article topic management exposes editable csv fields', () => {
  const page = readFileSync('src/app/admin/article-topics/page.tsx', 'utf8')
  const controls = readFileSync('src/app/admin/article-topics/ArticleTopicEditControls.tsx', 'utf8')
  const actions = readFileSync('src/app/admin/article-topics/actions.ts', 'utf8')

  assert.match(page, /ArticleTopicEditControls/)
  assert.match(page, /statusFilter/)
  assert.match(page, /riskFilter/)
  assert.match(page, /monthlyOnly/)
  assert.match(controls, /title_candidate/)
  assert.match(controls, /target_keyword/)
  assert.match(controls, /patient_intent/)
  assert.match(actions, /updateArticleTopicAction/)
  assert.match(actions, /title_candidate/)
  assert.match(actions, /medical_risk/)
})

test('article topic display and edit policy prefer shared GitHub data and distinguish fallback, errors, and valid empty CSV', async () => {
  const newGitHubCsv = articleTopicsCsv([articleTopicCsvRow('TOPIC-GITHUB', 'new GitHub')])
  const staleLocalCsv = articleTopicsCsv([articleTopicCsvRow('TOPIC-LOCAL', 'stale local')])
  const githubReader = async () => newGitHubCsv
  const display = await loadAdminArticleTopics(githubReader, { hasGitHubSource: true, readLocal: () => staleLocalCsv })
  const edit = await loadAdminArticleTopics(githubReader, { hasGitHubSource: true, readLocal: () => staleLocalCsv })
  for (const loaded of [display, edit]) {
    assert.equal(loaded.ok, true)
    assert.equal(loaded.source, 'github_main')
    assert.equal(loaded.data.topics[0].id, 'TOPIC-GITHUB')
  }

  const fallback = await loadAdminArticleTopics(async () => { throw new Error('fixture GitHub failure') }, {
    hasGitHubSource: true,
    readLocal: () => staleLocalCsv,
  })
  assert.equal(fallback.ok, true)
  assert.equal(fallback.source, 'local_fallback')
  assert.equal(fallback.errorCode, 'github_read_failed')

  const unavailable = await loadAdminArticleTopics(async () => { throw new Error('fixture GitHub failure') }, {
    hasGitHubSource: true,
    readLocal: () => { throw new Error('fixture local failure') },
  })
  assert.deepEqual(unavailable, { ok: false, errorCode: 'article_topics_unavailable' })

  const empty = await loadAdminArticleTopics(async () => articleTopicsCsv([]), {
    hasGitHubSource: true,
    readLocal: () => staleLocalCsv,
  })
  assert.equal(empty.ok, true)
  assert.equal(empty.source, 'github_main')
  assert.equal(empty.data.summary.total, 0)
  assert.deepEqual(empty.data.topics, [])

  const page = readFileSync('src/app/admin/article-topics/page.tsx', 'utf8')
  const actions = readFileSync('src/app/admin/article-topics/actions.ts', 'utf8')
  assert.match(page, /await loadAdminArticleTopics\(readGitHubArticleTopicsCsv\)/)
  assert.match(actions, /await loadAdminArticleTopics\(readGitHubArticleTopicsCsv\)/)
  assert.match(page, /local_fallback/)
  assert.match(page, /記事ネタCSVを読み込めません/)
  assert.match(page, /\.slice\(0, 80\)/)
  for (const filter of ['statusFilter', 'riskFilter', 'categoryFilter', 'monthlyOnly']) assert.match(page, new RegExp(filter))
  assert.match(actions, /source === 'github_main'/)
  const githubAdapter = readFileSync('src/lib/articleTopicsGithub.ts', 'utf8')
  assert.match(githubAdapter, /ref: ARTICLE_TOPICS_GITHUB_REF/)
  assert.match(githubAdapter, /branch: ARTICLE_TOPICS_GITHUB_REF/)
})

test('DMP action routes delegate to the stateless canonical transport with mandatory CAS hashes', () => {
  const store = readFileSync('src/lib/dmpActionStore.ts', 'utf8')
  const collection = readFileSync('src/app/api/dmp-core/v1/actions/route.ts', 'utf8')
  const summary = readFileSync('src/app/api/dmp-core/v1/actions/summary/route.ts', 'utf8')
  const detail = readFileSync('src/app/api/dmp-core/v1/actions/[id]/route.ts', 'utf8')
  const validate = readFileSync('src/app/api/dmp-core/v1/actions/[id]/validate/route.ts', 'utf8')
  const transition = readFileSync('src/app/api/dmp-core/v1/actions/[id]/transition/route.ts', 'utf8')

  for (const route of [collection, summary, detail, validate, transition]) {
    assert.match(route, /createActionTransport/)
    assert.match(route, /dmpActionCore/)
    assert.match(route, /mode: 'dry-run'/)
  }
  assert.match(collection, /transport\.listActions/)
  assert.match(collection, /transport\.createAction/)
  assert.match(summary, /transport\.getActionSummary/)
  assert.match(detail, /transport\.getAction/)
  assert.match(validate, /transport\.validateAction\(\{ id, expected_snapshot_hash \}\)/)
  assert.match(transition, /transport\.transitionAction\(\{ id, to_status, expected_snapshot_hash \}\)/)
  assert.match(validate, /expected_snapshot_hash/)
  assert.match(transition, /expected_snapshot_hash/)
  assert.doesNotMatch(store, /\bMap\b|\.set\(|createAction\(input\)/)
  assert.match(store, /core_unavailable/)
  assert.match(store, /listActions\(\): CoreResult \{\s+return unavailable\(\)/)
  assert.match(store, /createAction\(\): CoreResult \{\s+return unavailable\(\)/)
  assert.match(store, /getActionSummary\(\): CoreResult \{\s+return unavailable\(\)/)
})

test('topic candidates and pending review expose status filters and rejected body previews', () => {
  const topicCandidates = readFileSync('src/app/admin/topic-candidates/page.tsx', 'utf8')
  const pendingReview = readFileSync('src/app/admin/pending-review/page.tsx', 'utf8')
  const rejectedDeleteButton = readFileSync('src/app/admin/pending-review/RejectedPostDeleteButton.tsx', 'utf8')

  assert.match(topicCandidates, /statusFilter/)
  assert.match(topicCandidates, /riskFilter/)
  assert.match(topicCandidates, /sortTopicCandidatesForAdmin/)
  assert.match(pendingReview, /href="\/admin"/)
  assert.match(pendingReview, /管理トップ/)
  assert.match(pendingReview, /statusFilter/)
  assert.match(pendingReview, /renderReviewPostCard/)
  assert.match(pendingReview, /差し戻し理由/)
  assert.match(pendingReview, /PostBodyPreview/)
  assert.match(pendingReview, /RejectedPostDeleteButton/)
  assert.match(rejectedDeleteButton, /deleteRejectedPostAction/)
  assert.match(rejectedDeleteButton, /差し戻し記事を削除/)
  assert.doesNotMatch(rejectedDeleteButton, /slug を入力/)
})
