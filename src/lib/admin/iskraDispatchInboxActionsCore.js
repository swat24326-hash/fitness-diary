import { ISKRA_DISPATCH_ACTIVE_STATUSES } from './iskraDispatchCore.js'
import { allDispatchStagesDone, hasDispatchStages, countDispatchStagesDone } from './iskraDispatchStagesCore.js'

/**
 * Какие действия показывать тренеру — по одному шагу за раз.
 *
 * pending/seen → «Принял в работу» (+ «Перейти», если есть deep_link) (+ «Не могу»).
 * accepted → «Выполнено» (+ «Перейти», если есть deep_link).
 *
 * @param {{ status?: string, deep_link?: string | null, stages?: Array<{ done?: boolean }> }} item
 */
export function buildDispatchInboxActions(item) {
  const status = String(item?.status ?? 'pending')
  const hasDeepLink = !!String(item?.deep_link ?? '').trim()
  const withStages = hasDispatchStages(item?.stages)
  const stagesDone = withStages ? allDispatchStagesDone(item?.stages) : true
  const { done: stagesDoneCount, total: stagesTotal } = countDispatchStagesDone(item?.stages)

  if (!ISKRA_DISPATCH_ACTIVE_STATUSES.includes(status)) {
    return {
      primary: null,
      deepLink: false,
      canDecline: false,
      stepHint: '',
    }
  }

  if (status === 'pending' || status === 'seen') {
    return {
      primary: { action: 'accepted', label: 'Принял в работу' },
      deepLink: hasDeepLink,
      canDecline: true,
      stepHint: hasDeepLink
        ? 'Шаг 1 — можно сразу перейти к делу или принять задание'
        : 'Шаг 1 из 2 — подтвердите, что берёте задание',
    }
  }

  if (status === 'accepted') {
    if (withStages && !stagesDone) {
      return {
        primary: null,
        deepLink: hasDeepLink,
        canDecline: true,
        stepHint: `Этапы: ${stagesDoneCount}/${stagesTotal} — отметьте каждый шаг ниже`,
        stagesMode: true,
      }
    }
    return {
      primary: { action: 'done', label: withStages ? 'Закрыть задание' : 'Выполнено' },
      deepLink: hasDeepLink,
      canDecline: true,
      stepHint: withStages
        ? 'Все этапы готовы — подтвердите выполнение задания'
        : hasDeepLink
          ? 'Шаг 2 — выполните и отметьте готово или перейдите к делу'
          : 'Шаг 2 — отметьте выполнение',
      stagesMode: withStages,
    }
  }

  return {
    primary: null,
    deepLink: false,
    canDecline: false,
    stepHint: '',
  }
}

const STATUS_WEIGHT = /** @type {Record<string, number>} */ ({
  pending: 30,
  seen: 20,
  accepted: 10,
})

/**
 * Отсортированный список активных заданий (для свайпа на главной).
 *
 * @param {Array<object>} items
 * @param {Date} [now]
 */
export function sortActiveDispatchTasks(items, now = new Date()) {
  const active = (items ?? []).filter((i) => ISKRA_DISPATCH_ACTIVE_STATUSES.includes(String(i?.status ?? '')))
  return active
    .map((item) => ({ item, score: scoreSpotlightDispatch(item, now) }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.item)
}

/**
 * Самое срочное активное задание для виджета на главной.
 *
 * @param {Array<object>} items
 * @param {Date} [now]
 */
export function pickSpotlightDispatchTask(items, now = new Date()) {
  const sorted = sortActiveDispatchTasks(items, now)
  if (!sorted.length) return { spotlight: null, moreCount: 0 }

  return {
    spotlight: sorted[0] ?? null,
    moreCount: Math.max(0, sorted.length - 1),
  }
}

/**
 * @param {object} item
 * @param {Date} now
 */
function scoreSpotlightDispatch(item, now) {
  let score = 0
  if (item?.is_overdue) score += 100
  if (String(item?.priority ?? '') === 'high') score += 50
  score += STATUS_WEIGHT[String(item?.status ?? '')] ?? 0

  const due = item?.due_at ? Date.parse(String(item.due_at)) : NaN
  if (Number.isFinite(due)) {
    const daysLeft = (due - now.getTime()) / 86400000
    if (daysLeft <= 1) score += 25
    else if (daysLeft <= 3) score += 15
    else score += Math.max(0, 10 - daysLeft)
  }

  return score
}

/**
 * Короткая подпись для виджета на главной.
 *
 * @param {object | null} item
 */
export function buildDispatchGlanceCaption(item) {
  if (!item?.progress) return ''
  const wf = item.progress.workflow?.label ?? ''
  const time = item.progress.time
  if (!time || time.pct == null) return wf
  if (time.tone === 'overdue') return `${wf} · просрочено`
  return `${wf} · ${time.label}`
}
