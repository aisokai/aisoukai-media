#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsv, parseCsvHeaders } from './csv-parser.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const TOPICS_PATH = join(ROOT, 'data', 'article-topics.sample.csv');

const REQUIRED_COLUMNS = [
  'id',
  'discovered_at',
  'source_type',
  'source_url',
  'topic',
  'title_candidate',
  'category',
  'target_keyword',
  'patient_intent',
  'priority',
  'medical_risk',
  'status',
  'publish_date',
  'notes',
];

const VALID_CATEGORIES = new Set([
  '虫歯治療',
  '根管治療',
  '歯周病治療',
  '予防歯科',
  '小児歯科',
  '親知らず',
  'インプラント',
  'その他',
  'お知らせ',
]);

const VALID_SOURCE_TYPES = new Set(['trend', 'news', 'seasonal', 'clinic', 'seo', 'patient_question']);
const VALID_STATUSES = new Set(['idea', 'approved', 'drafting', 'reviewed', 'published', 'hold']);
const VALID_PRIORITIES = new Set(['high', 'medium', 'low']);
const VALID_MEDICAL_RISK = new Set(['high', 'medium', 'low']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(value) {
  return DATE_RE.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

function main() {
  let raw;
  try {
    raw = readFileSync(TOPICS_PATH, 'utf8');
  } catch (error) {
    console.error(`エラー: ${TOPICS_PATH} が見つかりません`);
    console.error(String(error?.message ?? error));
    process.exit(1);
  }

  const rows = parseCsv(raw);
  const errors = [];

  if (rows.length === 0) {
    errors.push('CSV にデータ行がありません');
  }

  const headers = parseCsvHeaders(raw);
  for (const column of REQUIRED_COLUMNS) {
    if (!headers.includes(column)) {
      errors.push(`必須列がありません: ${column}`);
    }
  }

  const seenIds = new Set();

  rows.forEach((row, index) => {
    const lineNo = index + 2;
    const id = String(row.id ?? '').trim();
    const discoveredAt = String(row.discovered_at ?? '').trim();
    const sourceType = String(row.source_type ?? '').trim();
    const topic = String(row.topic ?? '').trim();
    const titleCandidate = String(row.title_candidate ?? '').trim();
    const category = String(row.category ?? '').trim();
    const targetKeyword = String(row.target_keyword ?? '').trim();
    const patientIntent = String(row.patient_intent ?? '').trim();
    const priority = String(row.priority ?? '').trim();
    const medicalRisk = String(row.medical_risk ?? '').trim();
    const status = String(row.status ?? '').trim();
    const publishDate = String(row.publish_date ?? '').trim();

    if (!id) errors.push(`行 ${lineNo}: id が空です`);
    if (id && seenIds.has(id)) errors.push(`行 ${lineNo}: id が重複しています: ${id}`);
    if (id) seenIds.add(id);

    if (!isValidDate(discoveredAt)) errors.push(`行 ${lineNo}: discovered_at が YYYY-MM-DD ではありません: ${discoveredAt || '(空)'}`);
    if (!isValidDate(publishDate)) errors.push(`行 ${lineNo}: publish_date が YYYY-MM-DD ではありません: ${publishDate || '(空)'}`);

    if (!VALID_SOURCE_TYPES.has(sourceType)) errors.push(`行 ${lineNo}: source_type が無効です: ${sourceType || '(空)'}`);
    if (!VALID_CATEGORIES.has(category)) errors.push(`行 ${lineNo}: category が無効です: ${category || '(空)'}`);
    if (!VALID_PRIORITIES.has(priority)) errors.push(`行 ${lineNo}: priority が無効です: ${priority || '(空)'}`);
    if (!VALID_MEDICAL_RISK.has(medicalRisk)) errors.push(`行 ${lineNo}: medical_risk が無効です: ${medicalRisk || '(空)'}`);
    if (!VALID_STATUSES.has(status)) errors.push(`行 ${lineNo}: status が無効です: ${status || '(空)'}`);

    if (!topic) errors.push(`行 ${lineNo}: topic が空です`);
    if (!titleCandidate) errors.push(`行 ${lineNo}: title_candidate が空です`);
    if (!targetKeyword) errors.push(`行 ${lineNo}: target_keyword が空です`);
    if (!patientIntent) errors.push(`行 ${lineNo}: patient_intent が空です`);
  });

  if (errors.length > 0) {
    for (const error of errors) {
      console.error(`❌ ${error}`);
    }
    process.exit(1);
  }

  console.log(`✅ All topics valid (${rows.length} 件)`);
}

main();
