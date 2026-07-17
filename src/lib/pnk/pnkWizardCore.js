/**
 * Линейный мастер ПНК: 1 или 2 бесплатные, шаги без пропуска.
 * Без React / IDB. Не импортирует pnkStagesCore (избегаем цикла).
 */

import { isHealthCardComplete } from '../healthCardCore.js'

/** @typedef {'created'|'invite'|'health'|'nutrition'|'train1'|'hw1'|'train2'|'hw2'|'followup'|'close'} PnkWizardKey */

export const PNK_TRIAL_SESSIONS_OPTIONS = [1, 2]

const DELIVERABLE_KEYS = [
  'contact',
  'health',
  'nutrition',
  'trial',
  'homework',
  'trial2',
  'homework2',
  'followup',
]

function isOpenPnk(client) {
  const stage = String(client?.pnk_stage ?? '')
  return String(client?.lifecycle ?? '') === 'pnk' && Boolean(stage) && stage !== 'won' && stage !== 'lost'
}

function parseDeliverables(raw) {
  const out = Object.fromEntries(DELIVERABLE_KEYS.map((k) => [k, null]))
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  for (const key of DELIVERABLE_KEYS) {
    const v = raw[key]
    if (v == null || v === '') continue
    const s = String(v).trim()
    out[key] = s || null
  }
  return out
}

/**
 * @param {unknown} raw
 * @returns {1|2}
 */
export function normalizePnkTrialSessions(raw) {
  const n = Number(raw)
  return n === 2 ? 2 : 1
}

/**
 * @param {1|2} sessions
 */
export function buildPnkWizardStepList(sessions) {
  const n = normalizePnkTrialSessions(sessions)
  /** @type {{ key: PnkWizardKey, title: string, tab: string | null }[]} */
  const steps = [
    { key: 'created', title: 'Создан', tab: null },
    { key: 'invite', title: 'Контакт и дата', tab: null },
    { key: 'health', title: 'Здоровье', tab: 'health' },
    { key: 'nutrition', title: 'Питание', tab: 'nutrition' },
    { key: 'train1', title: n === 2 ? 'Тренировка 1 из 2' : 'Бесплатная тренировка', tab: 'diaries' },
    { key: 'hw1', title: n === 2 ? 'ДЗ после 1-й' : 'Домашнее задание', tab: 'homework' },
  ]
  if (n === 2) {
    steps.push(
      { key: 'train2', title: 'Тренировка 2 из 2', tab: 'diaries' },
      { key: 'hw2', title: 'ДЗ после 2-й', tab: 'homework' },
    )
  }
  steps.push(
    { key: 'followup', title: 'Контакт после бесплатной', tab: null },
    { key: 'close', title: 'Оформление', tab: null },
  )
  return steps
}

/**
 * @param {PnkWizardKey} key
 * @param {1|2} sessions
 */
function helpForWizardKey(key, sessions) {
  switch (key) {
    case 'invite':
      return 'Свяжитесь с клиентом и сохраните дату бесплатной. Дальше без даты нельзя.'
    case 'health':
      return 'Заполните карту здоровья (рост, вес, пол). Затем «Далее».'
    case 'nutrition':
      return 'Сохраните рацион кнопкой «Сохранить рацион». После сохранения можно «Далее». В Max — по желанию.'
    case 'train1':
      return sessions === 2
        ? 'Проведите первую бесплатную (1 из 2). После «Закончить» вернитесь и нажмите «Далее».'
        : 'Проведите бесплатную. После «Закончить» вернитесь и нажмите «Далее».'
    case 'hw1':
      return 'Соберите ДЗ и отправьте в Max — после отправки можно «Далее». Или нажмите «ДЗ выдано».'
    case 'train2':
      return 'Проведите вторую бесплатную (2 из 2). Здоровье и питание уже пройдены.'
    case 'hw2':
      return 'Соберите ДЗ после 2-й и отправьте в Max — затем «Далее». Или «ДЗ выдано».'
    case 'followup':
      return 'Свяжитесь с клиентом после бесплатной. Затем «Далее» или оформление.'
    case 'close':
      return 'Оформлен (ДК) или отказ.'
    default:
      return 'ПНК в воронке.'
  }
}

/**
 * Текущий шаг мастера.
 * @param {object} client
 * @param {{ healthCard?: object | null, healthComplete?: boolean, bzCompletedCount?: number }} [ctx]
 */
export function resolvePnkWizardStep(client, ctx = {}) {
  if (!isOpenPnk(client)) return null
  const sessions = normalizePnkTrialSessions(client?.pnk_trial_sessions)
  const steps = buildPnkWizardStepList(sessions)
  const d = parseDeliverables(client?.pnk_deliverables)
  const bzDone = Math.max(0, Number(ctx.bzCompletedCount) || 0)
  const trial1Done = Boolean(d.trial) || bzDone >= 1
  const trial2Done = Boolean(d.trial2) || bzDone >= 2

  /** @type {PnkWizardKey} */
  let key
  if (!d.contact || !client?.pnk_trial_date) {
    key = 'invite'
  } else if (!d.health) {
    key = 'health'
  } else if (!d.nutrition) {
    key = 'nutrition'
  } else if (!trial1Done) {
    key = 'train1'
  } else if (!d.homework) {
    key = 'hw1'
  } else if (sessions === 2 && !trial2Done) {
    key = 'train2'
  } else if (sessions === 2 && !d.homework2) {
    key = 'hw2'
  } else if (!d.followup) {
    key = 'followup'
  } else {
    key = 'close'
  }

  const idx = Math.max(0, steps.findIndex((s) => s.key === key))
  const meta = steps[idx]
  const n = idx + 1
  const total = steps.length
  return {
    key: meta.key,
    title: meta.title,
    tab: meta.tab,
    n,
    total,
    sessions,
    label: `Шаг ${n}/${total}: ${meta.title}`,
    help: helpForWizardKey(meta.key, sessions),
    steps,
  }
}

/**
 * @param {object} client
 * @param {ReturnType<typeof resolvePnkWizardStep>} step
 * @param {{ healthCard?: object | null, healthComplete?: boolean, bzCompletedCount?: number }} [ctx]
 */
export function canAdvancePnkWizardStep(client, step, ctx = {}) {
  if (!step) return { ok: false, reason: 'Нет шага' }
  const d = parseDeliverables(client?.pnk_deliverables)
  const bzDone = Math.max(0, Number(ctx.bzCompletedCount) || 0)
  const healthOk = ctx.healthComplete === true || isHealthCardComplete(ctx.healthCard)

  switch (step.key) {
    case 'invite':
      if (!client?.pnk_trial_date) return { ok: false, reason: 'Сохраните дату бесплатной' }
      if (!d.contact) return { ok: false, reason: 'Отметьте контакт (напишите клиенту)' }
      return { ok: true }
    case 'health':
      if (!healthOk) return { ok: false, reason: 'Заполните карту здоровья (рост, вес, пол)' }
      return { ok: true }
    case 'nutrition':
      if (!d.nutrition) return { ok: false, reason: 'Сначала сохраните рацион' }
      return { ok: true }
    case 'hw1':
      if (!d.homework) return { ok: false, reason: 'Отправьте ДЗ в Max или отметьте «ДЗ выдано»' }
      return { ok: true }
    case 'hw2':
      if (!d.homework2) return { ok: false, reason: 'Отправьте ДЗ в Max или отметьте «ДЗ выдано»' }
      return { ok: true }
    case 'train1':
      if (bzDone < 1 && !d.trial) return { ok: false, reason: 'Сначала завершите тренировку' }
      return { ok: true }
    case 'train2':
      if (bzDone < 2 && !d.trial2) return { ok: false, reason: 'Сначала завершите вторую тренировку' }
      return { ok: true }
    case 'followup':
      return { ok: true }
    case 'close':
      return { ok: false, reason: 'Выберите оформление или отказ' }
    default:
      return { ok: true }
  }
}

/**
 * @param {ReturnType<typeof resolvePnkWizardStep>} step
 */
export function buildPnkWizardAdvancePatch(step) {
  if (!step) return null
  switch (step.key) {
    case 'health':
      return { deliverable: 'health' }
    case 'nutrition':
      return { deliverable: 'nutrition' }
    case 'train1':
      return { stage: 'trial_done', deliverable: 'trial' }
    case 'hw1':
      return { deliverable: 'homework' }
    case 'train2':
      return { deliverable: 'trial2' }
    case 'hw2':
      return { deliverable: 'homework2' }
    case 'followup':
      return { stage: 'followup', deliverable: 'followup' }
    default:
      return null
  }
}

/**
 * @param {object} client
 * @param {number} bzCompletedCount
 */
export function resolvePnkTrialDeliverableAfterWorkout(client, bzCompletedCount) {
  const sessions = normalizePnkTrialSessions(client?.pnk_trial_sessions)
  const done = Math.max(0, Number(bzCompletedCount) || 0)
  const d = parseDeliverables(client?.pnk_deliverables)
  if (done >= 1 && !d.trial) return 'trial'
  if (sessions === 2 && done >= 2 && !d.trial2) return 'trial2'
  return null
}

/**
 * @param {object} client
 * @param {number} [bzCompletedCount]
 */
export function shouldOfferMarkPnkTrialDone(client, bzCompletedCount = 0) {
  if (!isOpenPnk(client)) return false
  return Boolean(resolvePnkTrialDeliverableAfterWorkout(client, bzCompletedCount))
}
