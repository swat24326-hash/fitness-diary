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
 * Мини-прогресс для UI (совместим с DispatchTaskProgressMini по форме).
 * @param {{ pct: number, stepN: number, stepTotal: number, stepTitle: string }} card
 */
export function buildPnkGlanceProgressMini(card) {
  const pct = Math.max(0, Math.min(100, Number(card?.pct) || 0))
  return {
    workflow: {
      pct,
      tone: pct >= 80 ? 'done' : pct >= 40 ? 'active' : 'pending',
      label: `Шаг ${card?.stepN ?? 0} из ${card?.stepTotal ?? 5}`,
      step: Math.max(0, (card?.stepN ?? 1) - 1),
      steps: [],
    },
    stages: {
      total: card?.stepTotal ?? 5,
      pct,
      tone: 'active',
      label: card?.stepTitle || '',
    },
    time: { pct: null },
  }
}
