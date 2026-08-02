import test from 'node:test'
import assert from 'node:assert/strict'
import { getStockPresentation } from '../src/lib/stockPresentation.mjs'

test('stock presentation renders every supported status with synthetic data', () => {
  assert.deepEqual(getStockPresentation('ready'), { label: 'レビュー可能', className: 'bg-amber-100 text-amber-800' })
  assert.deepEqual(getStockPresentation('hold'), { label: '保留', className: 'bg-slate-100 text-slate-800' })
  assert.deepEqual(getStockPresentation('rejected'), { label: '却下', className: 'bg-red-100 text-red-800' })
  assert.deepEqual(getStockPresentation('adopted'), { label: '採用済み', className: 'bg-green-100 text-green-800' })
})
