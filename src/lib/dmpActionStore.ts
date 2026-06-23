type DmpAction = {
  id: string
  type: string
  channel: string
  origin_surface: string
  status: string
  [key: string]: unknown
}

type ActionSummary = {
  total: number
  draft: number
  pending: number
  blocked: number
  validated: number
  waiting_human: number
  ready_for_local_execution: number
  executing: number
  done: number
  failed: number
  cancelled: number
}

const store: Map<string, DmpAction> = new Map()

export function getAll(): DmpAction[] {
  return Array.from(store.values())
}

export function set(id: string, action: DmpAction): void {
  store.set(id, action)
}

export function getSummary(): ActionSummary {
  const summary: ActionSummary = {
    total: 0,
    draft: 0,
    pending: 0,
    blocked: 0,
    validated: 0,
    waiting_human: 0,
    ready_for_local_execution: 0,
    executing: 0,
    done: 0,
    failed: 0,
    cancelled: 0,
  }
  for (const action of store.values()) {
    summary.total++
    const status = action.status as keyof Omit<ActionSummary, 'total'>
    if (status in summary) {
      summary[status]++
    }
  }
  return summary
}
