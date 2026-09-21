import {backfillId} from './mwf-backfill.mjs'
// Durable, article-scoped delivery. No credentials, network or publication here.
import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, openSync, writeSync, fsyncSync, closeSync, renameSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import matter from 'gray-matter'
import { verifyTieredCertificate } from '../../src/lib/tieredPublication.mjs'
import { getContentVersion } from '../../src/lib/dmpArticleState.mjs'

const hash = value => createHash('sha256').update(value).digest('hex')
const ID = /^[a-f0-9]{64}$/
export function deliveryId(slot, topicId) {
  if (!/^\d{4}-\d{2}-\d{2}T08:30:00\+09:00$/.test(slot) || !/^[A-Za-z0-9_-]{1,100}$/.test(topicId)) throw new Error('invalid_slot_or_topic')
  const d = new Date(slot)
  if (!Number.isFinite(+d) || new Date(+d + 9*3600000).toISOString().slice(0,10) !== slot.slice(0,10) || ![1,3,5].includes(new Date(+d + 9*3600000).getUTCDay())) throw new Error('invalid_schedule_day')
  return hash(`${slot}\0${topicId}`)
}
export function validateDraft(raw, verificationSecret) {
  if (typeof raw !== 'string' || raw.length > 500000) throw new Error('invalid_draft')
  const { data, content } = matter(raw)
  if (((data.draft !== true || data.reviewed !== false || data.auto_approved !== false) && !verifyTieredCertificate(data,content,verificationSecret)) || !content.trim() || typeof data.title !== 'string') throw new Error('unreviewed_draft_required')
  return { blob: hash(raw), contentVersion: getContentVersion(data, content), ...(ID.test(data.source_topic_version??'')?{sourceTopicVersion:data.source_topic_version}:{}) }
}
function append(path, value) {
  const fd = openSync(path, 'a', 0o600)
  try { writeSync(fd, JSON.stringify(value) + '\n'); fsyncSync(fd) } finally { closeSync(fd) }
}
export function openDeliveryStore(root) {
  root = resolve(root)
  const journal = join(root, 'events.jsonl')
  const artifacts = join(root, 'artifacts')
  function events() {
    if (!existsSync(journal)) return []
    const raw = readFileSync(journal, 'utf8')
    // A torn final record is attention, never silently discarded or overwritten.
    if (raw && !raw.endsWith('\n')) throw new Error('journal_incomplete')
    return raw.split('\n').filter(Boolean).map(line => JSON.parse(line))
  }
  return {
    root,
    read() {
      const items = {}
      for (const event of events()) {
        if (!ID.test(event.id)) throw new Error('invalid_journal_id')
        items[event.id] = { ...items[event.id], ...event }
      }
      return Object.values(items)
    },
    intakeNotice(slot, notice) {
      deliveryId(slot, 'intake-notice')
      const path=join(root,'intake-notifications.jsonl')
      if(notice!==undefined){append(path,{slot,status:notice,updatedAt:new Date().toISOString()});return notice}
      if(!existsSync(path))return null
      const raw=readFileSync(path,'utf8');if(raw&&!raw.endsWith('\n'))throw Error('intake_notice_journal_incomplete')
      const records=raw.split('\n').filter(Boolean).map(line=>JSON.parse(line))
      if(records.some(record=>!['sending','sent','not-sent','unknown'].includes(record.status)))throw Error('intake_notice_journal_invalid')
      return records.filter(record=>record.slot===slot).at(-1)?.status??null
    },
    save(item) { append(journal, { ...item, updatedAt: new Date().toISOString() }) },
    artifact(id, raw, reviewed = false) {
      if (!ID.test(id)) throw new Error('invalid_id')
      const path = join(artifacts, `${id}${reviewed ? '-reviewed' : ''}.md`)
      if (raw !== undefined && !existsSync(path)) {
        // Persist fully before making deterministic artifact visible.
        const temporary = join(artifacts, `${id}.${randomUUID()}.tmp`)
        const fd = openSync(temporary, 'wx', 0o600)
        try { writeSync(fd, raw); fsyncSync(fd) } finally { closeSync(fd) }
        renameSync(temporary, path)
      }
      return existsSync(path) ? readFileSync(path, 'utf8') : null
    },
    acquire() {
      mkdirSync(artifacts, { recursive: true, mode: 0o700 })
      const db = new DatabaseSync(join(root, 'run.sqlite'))
      try { db.exec('BEGIN IMMEDIATE') } catch { db.close(); throw new Error('already_running') }
      // OS-managed SQLite lock is released on process death. No stale timeout,
      // PID reuse, delete, or competing rename takeover can release another run.
      return () => { try { db.exec('ROLLBACK') } finally { db.close() } }
    },
  }
}
export function deliveryStatus(store, now = new Date(), onlyTopic) {
  const items = store.read().filter(i=>!onlyTopic||i.topicId===onlyTopic)
  let next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 30))
  next = new Date(+next - 86400000)
  while (+next <= +now || ![1,3,5].includes(new Date(+next + 9*3600000).getUTCDay())) next = new Date(+next + 86400000)
  return { nextScheduledAt: next.toISOString(), status: items.length ? 'tracked' : 'not-run', schedule: 'Mon/Wed/Fri 08:30 Asia/Tokyo',
    lastSuccessAt: items.filter(i => i.state === 'notified').map(i => i.notifiedAt).sort().at(-1) ?? null,
    items: items.map(({ id, slot, topicId, state, stage, updatedAt, contentVersion }) => ({ id, slot, topicId, state, stage, updatedAt, contentVersion })) }
}
export async function runDelivery({ store, slot, topicId, adapters, retryOnly = false, select, verificationSecret, onlyTopic, backfill }) {
  const release = store.acquire()
  try {
    let items = store.read()
    if(backfill){const existing=items.find(i=>i.topicId===onlyTopic);if(existing&&(existing.deliveryMode!=='backfill'||existing.slot!==slot||existing.topic?.serverTopicVersion!==backfill.topicVersion))return{...deliveryStatus(store,new Date(),onlyTopic),ok:false,intakeError:'backfill_existing_topic_conflict'}}
    if(onlyTopic&&!backfill){const existing=items.find(i=>i.topicId===onlyTopic);if(existing)slot=existing.slot}
    let intakeError = onlyTopic&&!backfill&&items.some(i=>i.deliveryMode!=='backfill'&&i.slot===slot&&i.topicId!==onlyTopic)?'slot_or_topic_already_reserved':null
    if(intakeError)retryOnly=true
    let candidateHolds = []
    let topic
    if (!retryOnly && select) {
      try {
        const selection = await select({ items, slot })
        candidateHolds=selection?.holds??[]
        if (!selection || selection.holdOnly) { retryOnly = true; intakeError = candidateHolds.length?'candidate-holds':'no-unused-topic' }
        else { topicId = selection.topicId; topic = selection.topic }
      } catch(error) { retryOnly = true; intakeError = ['candidate_configuration_missing','historical_inventory_evidence_missing','preserved_artifact_changed'].includes(error?.message)?error.message:'topic-intake-failed' }
    }
    if (!retryOnly) {
      const id = backfill?backfillId(slot,topicId):deliveryId(slot, topicId)
      // One topic per scheduled slot, and one scheduled generation per topic.
      if (items.some(i => ((!backfill&&i.deliveryMode!=='backfill'&&i.slot === slot) || i.topicId === topicId) && i.id !== id)) intakeError = 'slot_or_topic_already_reserved'
      if (!intakeError && !items.some(i => i.id === id)) { store.save({ id, slot, topicId, ...(backfill?{deliveryMode:'backfill',plannedDate:backfill.plannedDate}:{}), ...(topic ? { topic } : {}), state: 'selected', stage: 'generation' }); items = store.read() }
    }
    for (let item of items) {
      if(onlyTopic&&item.topicId!==onlyTopic)continue
      if(!onlyTopic&&['backfill','restore'].includes(item.deliveryMode))continue
      const save = patch => { item = { ...item, ...patch }; store.save(item) }
      try {
        if (['notified','notification-unknown','generation-unknown','conflict'].includes(item.state)) continue
        if (item.state === 'sending') { save({ state: 'notification-unknown', stage: 'notification' }); continue }
        let raw = store.artifact(item.id, undefined, item.certified===true)
        if (['selected','generating','generation-failed'].includes(item.state)) {
          if (!raw && item.state === 'generating') { save({ state: 'generation-unknown' }); continue }
          if (!raw && retryOnly) continue
          if (!raw) {
            save({ state: 'generating', stage: 'generation' })
            // Provider must honor the stable key or return an explicit unknown.
            const result = await adapters.generate({ idempotencyKey: item.id, topicId: item.topicId, slot: item.slot, topic: item.topic })
            if (result?.status !== 'generated') { save({ state: result?.status === 'not-generated' ? 'generation-failed' : 'generation-unknown' }); continue }
            raw = result.raw
            validateDraft(raw, verificationSecret)
            store.artifact(item.id, raw)
            save({generatedAt:new Date().toISOString()})
          }
          save({ state: 'saved', stage: 'sync', ...validateDraft(raw, verificationSecret), path: `content/posts/${item.slot.slice(0,10)}-mwf-${item.id}.md` })
        }
        if (!raw || validateDraft(raw, verificationSecret).blob !== item.blob) throw new Error('artifact_mismatch')
        if (item.deliveryMode!=='backfill' && item.state==='saved' && !item.reviewAttempted && adapters.review) {
          save({reviewAttempted:true,stage:'independent-review'})
          const reviewed=await adapters.review({raw,path:item.path,expectedBaseBlob:item.expectedBaseBlob})
          if (reviewed?.status==='certified') {
            const metadata=validateDraft(reviewed.raw,verificationSecret)
            store.artifact(item.id,reviewed.raw,true)
            raw=reviewed.raw
            save({...metadata,certified:true,stage:'sync'})
          } else save({reviewReason:reviewed?.reason??'review_unavailable',stage:'sync'})
        }
        if (['saved','sync-failed'].includes(item.state)) {
          if(item.deliveryMode==='backfill'&&item.certified===true)throw Error('backfill_must_remain_draft')
          const result = await adapters.sync({ ...item, raw })
          if (result?.status !== 'synced' || result.blob !== item.blob || !/^[a-f0-9]{40,64}$/.test(result.commit ?? '')) {
            save({ state: result?.status === 'conflict' ? 'conflict' : 'sync-failed', stage: 'sync' }); continue
          }
          save({ state: 'pending-reflection', stage: 'reflection', commit: result.commit })
        }
        if (['pending-reflection','reviewable','notification-failed'].includes(item.state)) {
          const proof = await adapters.reflect(item)
          const serverProof=adapters.serverAuthority===true&&proof?.originBlob===item.blob&&ID.test(proof?.contentVersion??'')&&ID.test(proof?.blob??'')&&typeof proof?.published==='boolean'
          if ((item.deliveryMode==='backfill'&&(proof?.published!==false||proof?.blob!==item.blob)) || proof?.authenticated !== true || proof.source !== 'production-admin' || proof.path !== item.path || (!serverProof&&(proof.contentVersion !== item.contentVersion || proof.blob !== item.blob || proof.published !== (item.certified===true))) || proof.reviewable !== true || (adapters.serverAuthority===true&&!serverProof)) {
            save({ state: 'pending-reflection', stage: 'reflection' }); continue
          }
          save({ state: 'reviewable', stage: 'notification', ...(serverProof?{deliveredBlob:proof.blob,deliveredContentVersion:proof.contentVersion,serverPublished:proof.published,reviewReason:proof.reason??null}:{}) })
          // Never retry an ambiguous send automatically; Telegram lacks an idempotency key.
          save({ state: 'sending' })
          const result = await adapters.notify({ idempotencyKey: item.id, path: item.path, contentVersion: item.deliveredContentVersion??item.contentVersion, published:item.serverPublished??item.certified===true })
          save({ state: result?.status === 'sent' ? 'notified' : result?.status === 'not-sent' ? 'notification-failed' : 'notification-unknown', ...(result?.status === 'sent' ? { notifiedAt: new Date().toISOString() } : {}) })
        }
      } catch {
        save({ state: item.state === 'sending' ? 'notification-unknown' : item.state === 'generating' ? 'generation-unknown' : item.stage === 'sync' ? 'sync-failed' : 'pending-reflection' })
      }
    }
    let intakeNotification
    if(intakeError&&slot&&!backfill&&adapters.notifyIntake&&store.intakeNotice){
      // The exclusive run lock and durable pre-send state prevent repeat sends,
      // including a timeout or process death after Telegram may have accepted it.
      const previous=store.intakeNotice(slot)
      if(previous)intakeNotification=previous==='sending'?'unknown':previous
      else{
        store.intakeNotice(slot,'sending')
        try{const notice=await adapters.notifyIntake({slot,reason:intakeError,heldCount:candidateHolds.length});intakeNotification=['sent','not-sent'].includes(notice?.status)?notice.status:'unknown'}catch{intakeNotification='unknown'}
        store.intakeNotice(slot,intakeNotification)
      }
    }
    const status = deliveryStatus(store,new Date(),onlyTopic)
    return { ...status, intakeError, candidateHolds, ...(intakeNotification?{intakeNotification}:{}), ok: !intakeError && status.items.length > 0 && status.items.every(i => i.state === 'notified') }
  } finally { release() }
}
