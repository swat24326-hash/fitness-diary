import { formatDispatchDueLabel } from './iskraTaskKindsCore.js'

const WORKFLOW_STEPS = /** @type {const} */ ([
  { id: 'pending', label: 'Новое', pct: 0 },
  { id: 'seen', label: 'Просмотр', pct: 33 },
  { id: 'accepted', label: 'В работе', pct: 66 },
  { id: 'done', label: 'Готово', pct: 100 },
])

/**
 * @param {string} status
 */
export function buildDispatchWorkflowProgress(status) {
  const s = String(status ?? 'pending')
  const stepIndex = WORKFLOW_STEPS.findIndex((x) => x.id === s)

  if (s === 'done') {
    return { pct: 100, label: 'Выполнено', step: 3, tone: 'done', steps: WORKFLOW_STEPS }
  }
  if (s === 'declined') {
    return { pct: 100, label: 'Отклонено', step: -1, tone: 'declined', steps: WORKFLOW_STEPS }
  }
  if (s === 'dismissed') {
    return { pct: 100, label: 'Скрыто', step: -1, tone: 'dismissed', steps: WORKFLOW_STEPS }
  }

  const idx = stepIndex >= 0 ? stepIndex : 0
  const pct = WORKFLOW_STEPS[idx]?.pct ?? 0
  const labels = {
    pending: 'Ожидает просмотра',
    seen: 'Просмотрено',
    accepted: 'В работе',
  }
  return {
    pct,
    label: labels[s] ?? 'Задание',
    step: idx,
    tone: s === 'accepted' ? 'active' : s === 'seen' ? 'seen' : 'pending',
    steps: WORKFLOW_STEPS,
  }
}

/**
 * @param {string | null | undefined} createdAtIso
 * @param {string | null | undefined} dueAtIso
 * @param {Date} [now]
 */
export function buildDispatchTimeProgress(createdAtIso, dueAtIso, now = new Date()) {
  if (!dueAtIso) {
    return { pct: null, label: 'Без срока', tone: 'none' }
  }

  const end = Date.parse(String(dueAtIso))
  if (!Number.isFinite(end)) {
    return { pct: null, label: 'Без срока', tone: 'none' }
  }

  const t = now.getTime()
  let start = createdAtIso ? Date.parse(String(createdAtIso)) : NaN
  if (!Number.isFinite(start) || start >= end) {
    start = end - 3 * 24 * 60 * 60 * 1000
  }

  if (t >= end) {
    return { pct: 100, label: 'Срок истёк', tone: 'overdue', dueLabel: formatDispatchDueLabel(dueAtIso) }
  }

  const span = Math.max(end - start, 1)
  const pct = Math.round(Math.min(100, Math.max(0, ((t - start) / span) * 100)))
  const remainMs = end - t
  const remainHours = remainMs / (60 * 60 * 1000)

  let label
  if (remainHours < 1) label = 'Меньше часа'
  else if (remainHours < 24) label = `Осталось ${Math.max(1, Math.round(remainHours))} ч`
  else label = `Осталось ${Math.max(1, Math.round(remainHours / 24))} дн`

  const tone = pct >= 90 ? 'warn' : 'ok'
  return { pct, label, tone, dueLabel: formatDispatchDueLabel(dueAtIso) }
}

/**
 * @param {{ status?: string, created_at?: string | null, due_at?: string | null, is_overdue?: boolean }} row
 * @param {Date} [now]
 */
export function buildDispatchProgressForUi(row, now = new Date()) {
  const workflow = buildDispatchWorkflowProgress(row?.status)
  const time = buildDispatchTimeProgress(row?.created_at, row?.due_at, now)
  if (row?.is_overdue && time.pct != null) {
    time.tone = 'overdue'
    time.label = 'Просрочено'
    time.pct = 100
  }

  let combinedPct = workflow.pct
  if (time.pct != null) {
    combinedPct = Math.round((workflow.pct + time.pct) / 2)
  }

  let combinedTone = 'ok'
  if (workflow.tone === 'declined' || workflow.tone === 'dismissed') combinedTone = workflow.tone
  else if (time.tone === 'overdue' || row?.is_overdue) combinedTone = 'overdue'
  else if (time.tone === 'warn') combinedTone = 'warn'
  else if (workflow.tone === 'done') combinedTone = 'done'

  return { workflow, time, combinedPct, combinedTone }
}
