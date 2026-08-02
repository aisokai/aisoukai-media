const PRESENTATION = {
  ready: { label: 'レビュー可能', className: 'bg-amber-100 text-amber-800' },
  hold: { label: '保留', className: 'bg-slate-100 text-slate-800' },
  rejected: { label: '却下', className: 'bg-red-100 text-red-800' },
  adopted: { label: '採用済み', className: 'bg-green-100 text-green-800' },
}

export function getStockPresentation(status) {
  return PRESENTATION[status] ?? PRESENTATION.ready
}
