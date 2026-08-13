#!/usr/bin/env node
// One-time, fail-closed migration for the approved snapshot that predates
// reviewed_content_hash. This is not a publication-time compatibility path.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import matter from 'gray-matter'
import { getReviewedContentFingerprint } from '../src/lib/reviewContentFingerprint.mjs'

const ROOT = join(fileURLToPath(new URL('..', import.meta.url)))
const POSTS_DIR = join(ROOT, 'content', 'posts')

// These are the only legacy snapshots this migration can lock. The values are
// fingerprints of their exact pre-migration approved versions, so a changed
// file cannot receive a replacement approval hash from this command.
export const LEGACY_APPROVED_SNAPSHOT = Object.freeze({
  '2026-01-15-ai-dental-diagnosis.md': '6e03258ead4f1030e2c212785f9d3fdb08edacc34ca075e62204b0ed2e8bd7fa',
  '2026-01-20-cavity-treatment.md': 'b3000d11eae35bec7b82a6d7b8a45b69dd2476d1d52b199b290edd6fe7e9dae6',
  '2026-02-05-root-canal.md': '883e466eec64b7a752951a81ae57ac9fbba9e1c0b31f853a6b1da7842360bb40',
  '2026-02-15-periodontal-disease.md': '371ef750b2b16c719b1094c998d023ccb403fa30334f0e9de7ef476b98f56495',
  '2026-03-01-preventive-dentistry.md': '5d6ea1153ad8481ffe9e26489062bfee71254ee3823c0ddf8bfc6af35ace4db0',
  '2026-03-10-pediatric-dentistry.md': '370e1580877470fc70b9cf1aa4ae643ac190ffb3d63c529082f5e13c77c58bca',
  '2026-03-20-wisdom-tooth.md': 'e55e2d6a81881d0e526f5877c3c6b8d6a8e4f63dd4d08f912799d4937eda25d5',
  '2026-05-12-dental-checkup-guide.md': '1b6ec34f33982fde4addb40460a31a3f51f68344ace5595a2ebf91fe6b19ee12',
  '2026-05-13-cadcam.md': '9375d482c33fab100e5930a042cf6816340d7c44ad0165a8ae4164db8c764481',
  '2026-05-14-req-145026178.md': '79752e50dd8943dc22b0cce1a356bfd3c31a13cb8c34ed30d2e1725b01c5d5cf',
  '2026-05-15-req-145026188.md': '0f45bd1847866a48b47615e188463cc0c292391d971c1c44f06dfab92ec1dfaa',
  '2026-05-15-req-145026190.md': '4141f78f7af2d6fbd4a00c504a1351a4060171ccc96e3305766589cf4d3b8dd6',
  '2026-05-15-req-145026191.md': '1cc53f4a14dac3827beb3c54d8a714d77f101dacba914d3f3319aad396924ea5',
  '2026-05-22-topic-20260511-007.md': '3621aa1de6108e67369ff960c6a0ec9b338da3833203143f8e026826631baa58',
  '2026-05-24-topic-20260511-002.md': '2d19336c137cf9ba7c2118e4578caf5c583c7f1acfed4d0e76918bebf58ad15f',
  '2026-05-26-topic-20260512-031.md': '5ed70f565522c4bd17b6cbc0a3c1ef357fa9e06d0354f7e709f3fc96c6ccb94d',
  '2026-06-08-home-whitening-campaign-2026.md': 'cf24d26ff4a9880fb6fef162f8a1e3c75ad89d576656493900a2d85ca1bb5fb1',
  '2026-06-10-monthly-202606topic001.md': '06c00da3a2062182d1cdf4cb826039db7259dd19ccbef7f8b0ed94a6706c5088',
  '2026-06-12-monthly-202606topic002.md': 'c858a4e9bb1e45ba5134b8f8c8f1edf383ac57b9c72dadbe19d9327a061d3a77',
  '2026-06-19-monthly-202606topic005.md': '5340e4ed087227172b0028f563a9fa478a851f06b20e017c02061a60ad883e4d',
  '2026-06-22-monthly-202606topic012.md': '8cf3ddce467cfdd1328f71b715a673057cd4496a65184986d5fd0d42726ba4b2',
  '2026-06-26-monthly-202606topic008.md': '7ebbf8b3cacd7722f45b9800a8214c149f85d4269bcffa3d879e7e50d014e364',
  '2026-06-29-monthly-202606topic009.md': '4c081b83fe73a9e43a4cc76beb7df3bdbee7cd9d97191e24ea6b7739c13ad667',
  '2026-07-01-monthly-202606topic010.md': '1abadf92d258d40f6289471451c462fddcc2617f682e64f22e090bb0d5bf8fc3',
  '2026-07-03-monthly-202606topic015.md': '219c526433709af93d74ab7d6ffac9324d6cb8f227de2f86ec9a6ae84e2fb0b4',
  '2026-07-06-monthly-202606topic018.md': '08bcb7d077c011224983727292f8d07f84cc69f5c4e0ada1dde5c9eea80977fb',
  '2026-07-08-monthly-202606topic019.md': '33ce5df8cfa3546d714438139348d2824e0043fa3710b23d5e6dd84cccfc3b60',
  '2026-07-10-monthly-202606topic014.md': '4715f46433ed4d4dfafb3c35fc91fb925f3f099fb16eb83259a3420385033f8e',
  '2026-07-15-monthly-202606topic020.md': '4f1e29130a0cf21806ec829cb14bae1a091b4fea32ab3265e66fe9c725cfe597',
  '2026-07-20-topic-03bae58c5451d379.md': '59994563e284a90d01e05d017c5e168d24faa4b572104d82ea4d2810afd39b1a',
})

function insertHash(raw, fingerprint) {
  if (!raw.startsWith('---\n')) throw new Error('frontmatter start is missing')
  const end = raw.indexOf('\n---', 4)
  if (end === -1) throw new Error('frontmatter end is missing')
  return `${raw.slice(0, end)}\nreviewed_content_hash: ${fingerprint}${raw.slice(end)}`
}

export function migrateLegacyApprovedSnapshot({ apply = false } = {}) {
  const planned = []
  for (const [fileName, expectedFingerprint] of Object.entries(LEGACY_APPROVED_SNAPSHOT)) {
    const filePath = join(POSTS_DIR, fileName)
    const raw = readFileSync(filePath, 'utf8')
    const parsed = matter(raw)
    const actual = getReviewedContentFingerprint(parsed.data, parsed.content)
    if (actual !== expectedFingerprint) throw new Error(`${fileName}: approved snapshot does not match`)
    if (parsed.data.reviewed !== true || !parsed.data.reviewed_at || !parsed.data.reviewed_by || parsed.data.draft === true || parsed.data.archived === true || parsed.data.rejection_reason) {
      throw new Error(`${fileName}: no longer matches the bounded Human-approved legacy state`)
    }
    const stored = String(parsed.data.reviewed_content_hash ?? '').trim()
    if (stored && stored !== expectedFingerprint) throw new Error(`${fileName}: existing approval hash does not match snapshot`)
    if (!stored) planned.push({ fileName, filePath, raw: insertHash(raw, expectedFingerprint) })
  }
  if (apply) for (const entry of planned) writeFileSync(entry.filePath, entry.raw, 'utf8')
  return { expected: Object.keys(LEGACY_APPROVED_SNAPSHOT).length, migrated: planned.length, files: planned.map(({ fileName }) => fileName) }
}

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const result = migrateLegacyApprovedSnapshot({ apply: process.argv.includes('--apply') })
  console.log(`legacy-reviewed-content-hash migration: ${process.argv.includes('--apply') ? 'applied' : 'dry-run'} (${result.migrated}/${result.expected})`)
}
