/**
 * Карточки ПНК для виджета на главной тренера (как glance заданий).
 */
import {
  buildPnkAttentionFlags,
  isOpenPnkClient,
  resolvePnkTrainerUiStep,
} from './pnkStagesCore.js'
import { formatDateRu } from '../dateRu.js'

/**
 * @param {object} client
 * @param {Date} [now]
 * @returns {{
 *   id: string,
 *   name: string,
 *   href: string,
 *   stepTitle: string,
 *   stepLabel: string,
 *   stepN: number,
 *   stepTotal: number,
 *   pct: number,
 *   caption: string,
 *   isHot: boolean,
 *   hotLabel: string | null,
 *   sortKey: number,
 * } | null}
 */
export function buildPnkGlanceCard(client, now = new Date()) {
  if (!isOpenPnkClient(client)) return null
  const id = String(client?.id ?? '').trim()
  if (!id) return null

  const step = resolvePnkTrainerUiStep(client)
  if (!step) return null

  const flags = buildPnkAttentionFlags(client, now)
  const hotFlag =
    flags.find((f) => f.tone === 'hot') ||
    flags.find((f) => f.code === 'need_contact' || f.code === 'noshow' || f.code === 'need_followup') ||
    flags.find((f) => f.tone === 'warn')
  const isHot = Boolean(
    flags.some(
      (f) =>
        f.tone === 'hot' ||
        f.code === 'need_contact' ||
        f.code === 'noshow' ||
        f.code === 'need_followup',
    ),
  )

  const trialDate = String(client?.pnk_trial_date ?? '').slice(0, 10)
  const trialTime = String(client?.pnk_trial_time ?? '').trim()
  let caption = step.label
  if (trialDate && (step.key === 'visit' || step.key === 'invite')) {
    caption = `Бесплатная: ${formatDateRu(trialDate)}${trialTime ? ` ${trialTime}` : ''}`
  } else if (hotFlag?.label) {
    caption = hotFlag.label
  }

  const pct = Math.round((step.n / Math.max(step.total, 1)) * 100)

  return {
    id,
    name: String(client?.name ?? '').trim() || 'ПНК',
    href: `/trainer/clients/${encodeURIComponent(id)}`,
    stepTitle: step.title,
    stepLabel: step.label,
    stepN: step.n,
    stepTotal: step.total,
    pct,
    caption,
    isHot,
    hotLabel: hotFlag?.label || null,
  }
}

/**
 * @param {object[]} clients
 * @param {Date} [now]
 */
export function buildPnkGlanceCards(clients, now = new Date()) {
  const list = []
  for (const c of Array.isArray(clients) ? clients : []) {
    if (c?.archived_at) continue
    const card = buildPnkGlanceCard(c, now)
    if (card) list.push(card)
  }
  list.sort((a, b) => {
    if (a.isHot !== b.isHot) return a.isHot ? -1 : 1
    if (a.stepN !== b.stepN) return a.stepN - b.stepN
    return a.name.localeCompare(b.name, 'ru')
  })
  return list
}

/**
 * Одна шкала из блоков шагов воронки (1…total).
 * @param {{ stepN?: number, stepTotal?: number } | null | undefined} card
 * @returns {{ stepN: number, total: number, segments: { index: number, state: 'done' | 'current' | 'todo' }[] }}
 */
export function buildPnkStepSegments(card) {
  const total = Math.max(1, Math.min(12, Number(card?.stepTotal) || 5))
  const stepN = Math.max(0, Math.min(total, Number(card?.stepN) || 0))
  /** @type {{ index: number, state: 'done' | 'current' | 'todo' }[]} */
  const segments = []
  for (let i = 1; i <= total; i++) {
    let state = 'todo'
    if (i < stepN) state = 'done'
    else if (i === stepN) state = 'current'
    segments.push({ index: i, state })
  }
  return { stepN, total, segments }
}

/** @deprecated используйте buildPnkStepSegments + PnkStepBlocks */
export function buildPnkGlanceProgressMini(card) {
  const { stepN, total } = buildPnkStepSegments(card)
  const pct = Math.round((stepN / total) * 100)
  return {
    workflow: { pct, tone: 'active', label: `Шаг ${stepN} из ${total}`, step: Math.max(0, stepN - 1), steps: [] },
    stages: { total, pct, tone: 'active', label: '' },
    time: { pct: null },
  }
}
