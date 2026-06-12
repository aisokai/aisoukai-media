import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { findCandidates, loadFeedback } from './image-scoring.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..', '..')
const LIBRARY_PATH = join(ROOT, 'data', 'image-library.json')

const CATEGORY_TO_LIB_CATEGORY = {
  '虫歯治療': 'cavity',
  '根管治療': 'root-canal',
  '歯周病治療': 'periodontal',
  '予防歯科': 'preventive',
  '小児歯科': 'pediatric',
  '親知らず': 'wisdom-tooth',
  'インプラント': 'implant',
  'お知らせ': 'announcement',
  'その他': 'general',
}

const KEYWORD_RULES = [
  { re: /詰め物|被せ物|クラウン|インレー|虫歯|むし歯|cavity/i, category: '虫歯治療', alt: '虫歯治療をイメージした歯科診療画像' },
  { re: /根管|神経|歯の根|root/i, category: '根管治療', alt: '根管治療をイメージした歯科診療画像' },
  { re: /歯周病|歯ぐき|歯茎|歯肉|periodontal/i, category: '歯周病治療', alt: '歯周病治療をイメージした歯科診療画像' },
  { re: /ホワイトニング|whitening/i, category: '予防歯科', alt: 'ホワイトニング相談をイメージした歯科診療画像' },
  { re: /親知らず|智歯/i, category: '親知らず', alt: '親知らずの相談をイメージした歯科診療画像' },
  { re: /小児|子ども|子供|乳歯/i, category: '小児歯科', alt: '小児歯科の診療をイメージした画像' },
  { re: /インプラント/i, category: 'インプラント', alt: 'インプラント治療の相談をイメージした歯科診療画像' },
]

const CATEGORY_ALT = {
  '虫歯治療': '虫歯治療をイメージした歯科診療画像',
  '根管治療': '根管治療をイメージした歯科診療画像',
  '歯周病治療': '歯周病治療をイメージした歯科診療画像',
  '予防歯科': '予防歯科をイメージした歯科診療画像',
  '小児歯科': '小児歯科の診療をイメージした画像',
  '親知らず': '親知らずの相談をイメージした歯科診療画像',
  'インプラント': 'インプラント治療の相談をイメージした歯科診療画像',
  'お知らせ': '歯科医院からのお知らせをイメージした案内画像',
  'その他': '歯科診療をイメージした画像',
}

const FALLBACK_IMAGE_PATHS = [
  '/images/library/general/general-34430968.jpg',
  '/images/library/preventive/preventive-3986826.jpg',
  '/images/library/cavity/cavity-34431026.jpg',
]

function imageDiskPath(imagePath) {
  return join(ROOT, 'public', String(imagePath ?? ''))
}

function isUsableLibraryImage(image) {
  const imagePath = String(image?.path ?? '').trim()
  return (
    imagePath.startsWith('/images/library/')
    && existsSync(imageDiskPath(imagePath))
    && String(image?.alt ?? '').trim() !== ''
  )
}

export function loadUsableLibraryImages() {
  if (!existsSync(LIBRARY_PATH)) return []
  try {
    const library = JSON.parse(readFileSync(LIBRARY_PATH, 'utf8'))
    return (library.images ?? []).filter(isUsableLibraryImage)
  } catch {
    return []
  }
}

function inferCategory(category, text) {
  if (category && category !== 'その他') return category
  for (const rule of KEYWORD_RULES) {
    if (rule.re.test(text)) return rule.category
  }
  return category || 'その他'
}

export function buildGeneratedImageAlt({ title = '', category = '', tags = [], sourceTopicId = '', bodyContent = '' }) {
  const text = [title, category, ...tags, sourceTopicId, bodyContent.slice(0, 300)].join(' ')
  for (const rule of KEYWORD_RULES) {
    if (rule.re.test(text)) return rule.alt
  }
  return CATEGORY_ALT[category] ?? CATEGORY_ALT['その他']
}

function findFallbackImage(images, category) {
  const libCategory = CATEGORY_TO_LIB_CATEGORY[category] ?? 'general'
  return (
    images.find((img) => img.category === libCategory)
    ?? images.find((img) => img.category === 'general')
    ?? FALLBACK_IMAGE_PATHS.map((path) => images.find((img) => img.path === path)).find(Boolean)
    ?? null
  )
}

export function pickArticleImage({
  title = '',
  category = '',
  excerpt = '',
  tags = [],
  sourceTopicId = '',
  bodyContent = '',
} = {}) {
  const images = loadUsableLibraryImages()
  if (images.length === 0) {
    throw new Error('利用可能な画像が data/image-library.json / public/images/library に見つかりません')
  }

  const textForCategory = [title, category, excerpt, ...tags, sourceTopicId, bodyContent.slice(0, 300)].join(' ')
  const effectiveCategory = inferCategory(category, textForCategory)
  const candidates = findCandidates({
    images,
    title,
    category: effectiveCategory,
    excerpt: [excerpt, ...tags, sourceTopicId].filter(Boolean).join(' '),
    bodyContent,
    usedImages: new Set(),
    limit: 3,
    feedback: loadFeedback(),
  })

  const picked = candidates[0]?.img ?? findFallbackImage(images, effectiveCategory)
  if (!picked || !existsSync(imageDiskPath(picked.path))) {
    throw new Error('fallback画像を含めて利用可能な画像を選択できません')
  }

  return {
    image: picked.path,
    image_alt: buildGeneratedImageAlt({ title, category: effectiveCategory, tags, sourceTopicId, bodyContent }),
    image_id: picked.id,
    image_library_alt: picked.alt,
    category: effectiveCategory,
    reason: candidates[0] ? (candidates[0].notes ?? []).join(' / ') : 'fallback',
    candidates,
  }
}

export function imagePresenceStatus(data) {
  const image = String(data?.image ?? '').trim()
  const imageAlt = String(data?.image_alt ?? '').trim()
  return {
    image: image ? 'ok' : 'missing',
    image_alt: imageAlt ? 'ok' : 'missing',
  }
}
