#!/usr/bin/env node

/**
 * RFC 4180 準拠 CSV パーサー。
 * quoted フィールド内の改行・カンマ・ダブルクォートを正しく処理する。
 */

/**
 * 1 セルのトークナイズ用ステートマシンで CSV 全体をパースし、
 * 各行をフィールド配列として返す。ヘッダー行を含む全行を返す。
 *
 * @param {string} text - CSV テキスト（\r\n / \n 混在可）
 * @returns {string[][]} rows - 2 次元配列（行 × セル）
 */
export function parseCsvRows(text) {
  const rows = []
  let row = []
  let cell = ''
  let inQuotes = false
  // CRLF を LF に正規化してから処理する
  const src = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const len = src.length

  for (let i = 0; i < len; i += 1) {
    const ch = src[i]

    if (inQuotes) {
      if (ch === '"') {
        // 次の文字も " なら escaped quote
        if (src[i + 1] === '"') {
          cell += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        // quoted フィールド内の改行もそのままセルに含める
        cell += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
        row.push(cell.trim())
        cell = ''
      } else if (ch === '\n') {
        row.push(cell.trim())
        cell = ''
        if (row.length > 0) rows.push(row)
        row = []
      } else {
        cell += ch
      }
    }
  }

  // ファイル末尾の残余を処理
  row.push(cell.trim())
  if (row.some((c) => c !== '')) rows.push(row)

  return rows
}

/**
 * CSV テキストをパースし、1 行目をヘッダーとして
 * 各データ行をオブジェクト配列で返す。
 *
 * @param {string} text - CSV テキスト
 * @returns {Record<string, string>[]}
 */
export function parseCsv(text) {
  const normalized = text.trim()
  if (!normalized) return []

  const allRows = parseCsvRows(normalized)
  if (allRows.length === 0) return []

  const headers = allRows[0]

  return allRows.slice(1).map((cells) => {
    const row = {}
    headers.forEach((header, index) => {
      row[header] = cells[index] ?? ''
    })
    return row
  })
}

/**
 * CSV テキストの 1 行目からヘッダー列名の配列を返す。
 *
 * @param {string} text - CSV テキスト
 * @returns {string[]}
 */
export function parseCsvHeaders(text) {
  const normalized = text.trim()
  if (!normalized) return []
  const allRows = parseCsvRows(normalized)
  return allRows[0] ?? []
}
