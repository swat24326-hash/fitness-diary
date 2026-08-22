/**
 * Воронка ПНК: этапы, чеклист, переходы, внимание менеджера (без React/IDB).
 */

import { resolvePnkWizardStep } from './pnkWizardCore.js'

/** @typedef {'new'|'assigned'|'contact'|'agreed'|'trial_done'|'followup'|'won'|'lost'} PnkStage */
/** @typedef {'contact'|'visit_started'|'health'|'nutrition'|'trial'|'homework'|'trial2'|'homework2'|'followup'} PnkDeliverableKey */
/** @typedef {'active'|'pnk'|'pnk_lost'} ClientLifecycle */

/** @type {PnkStage[]} */
export const PNK_STAGES = ['new', 'assigned', 'contact', 'agreed', 'trial_done', 'followup', 'won', 'lost']

/** @type {Record<PnkStage, string>} */
export const PNK_STAGE_LABELS = {
  new: 'Создан ПНК',
  assigned: 'Создан ПНК',
  contact: 'Связь с клиентом',
  agreed: 'Дата бесплатной',
  trial_done: 'Тренировка',
  followup: 'Касание после',
  won: 'Оформлен',
  lost: 'Отказ',
}

/** @type {PnkDeliverableKey[]} */
export const PNK_DELIVERABLE_KEYS = [
  'contact',
  'visit_started',
  'health',
  'nutrition',
  'trial',
  'homework',
  'trial2',
  'homework2',
  'followup',
]

/** @type {Record<PnkDeliverableKey, string>} */
export const PNK_DELIVERABLE_LABELS = {
  contact: 'Связь с клиентом',
  visit_started: 'Начало тренировки',
  health: 'Здоровье и обмеры',
  nutrition: 'Питание',
  trial: 'Тренировка',
  homework: 'Домашнее задание',
  trial2: 'Тренировка 2',
  homework2: 'ДЗ после 2-й',
  followup: 'Касание после',
}

/** Часы до «горит» без касания после передачи */
export const PNK_CONTACT_SLA_HOURS = 24

/**
 * @param {unknown} stage
 * @returns {stage is PnkStage}
 */
export function isPnkStage(stage) {
  return PNK_STAGES.includes(/** @type {PnkStage} */ (String(stage ?? '')))
}

/**
 * @param {unknown} lifecycle
 * @returns {lifecycle is ClientLifecycle}
 */
export function isClientLifecycle(lifecycle) {
  const s = String(lifecycle ?? '')
  return s === 'active' || s === 'pnk' || s === 'pnk_lost'
}

/** Клиент в открытой воронке ПНК (ещё не ДК и не отказ) */
export function isOpenPnkClient(client) {
  const stage = client?.pnk_stage
  return (
    String(client?.lifecycle ?? '') === 'pnk' &&
    isPnkStage(stage) &&
    stage !== 'won' &&
    stage !== 'lost'
  )
}

export function isPnkLifecycleClient(client) {
  const lc = String(client?.lifecycle ?? 'active')
  return lc === 'pnk' || lc === 'pnk_lost'
}

/**
 * Можно удалить карточку ПНК с доски менеджера/админа
 * (не трогаем уже оформленных ДК).
 * @param {object} client
 */
export function canDeletePnkClient(client) {
  if (!client?.id) return false
  return isPnkLifecycleClient(client)
}

/**
 * @param {unknown} raw
 * @returns {Record<PnkDeliverableKey, string | null>}
 */
export function parsePnkDeliverables(raw) {
  /** @type {Record<PnkDeliverableKey, string | null>} */
  const out = {
    contact: null,
    health: null,
    nutrition: null,
    trial: null,
    homework: null,
    trial2: null,
    homework2: null,
    followup: null,
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  for (const key of PNK_DELIVERABLE_KEYS) {
    const v = raw[key]
    if (v == null || v === '') {
      out[key] = null
      continue
    }
    const s = String(v).trim()
    out[key] = s || null
  }
  return out
}

/**
 * @param {unknown} raw
 * @returns {{ at: string, text: string, by_role?: string, by_name?: string }[]}
 */
export function parsePnkComments(raw) {
  if (!Array.isArray(raw)) return []
  const out = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const text = String(item.text ?? '').trim().slice(0, 500)
    const at = String(item.at ?? '').trim()
    if (!text || !at) continue
    out.push({
      at,
      text,
      by_role: item.by_role != null ? String(item.by_role).slice(0, 40) : undefined,
      by_name: item.by_name != null ? String(item.by_name).slice(0, 80) : undefined,
    })
  }
  return out.slice(-40)
}

/**
 * @param {PnkStage | string | null | undefined} stage
 */
export function pnkStageIndex(stage) {
  const i = PNK_STAGES.indexOf(/** @type {PnkStage} */ (String(stage ?? '')))
  return i >= 0 ? i : 0
}

/**
 * @param {PnkStage} from
 * @param {PnkStage} to
 */
export function canAdvancePnkStage(from, to) {
  if (!isPnkStage(from) || !isPnkStage(to)) return false
  if (from === to) return true
  if (from === 'won' || from === 'lost') return false
  if (to === 'lost') return true
  if (to === 'won') return from !== 'new'
  // открытая воронка: можно ставить актуальный этап действием (дата, пробная, касание)
  return to !== 'won' && to !== 'lost'
}

/**
 * @param {object} client
 * @param {PnkDeliverableKey} key
 * @param {string} [iso]
 */
export function markPnkDeliverable(client, key, iso = new Date().toISOString()) {
  if (!PNK_DELIVERABLE_KEYS.includes(key)) {
    return { ok: false, error: 'Неизвестный пункт чеклиста', client }
  }
  const deliverables = parsePnkDeliverables(client?.pnk_deliverables)
  deliverables[key] = String(iso)
  return { ok: true, client: { ...client, pnk_deliverables: deliverables } }
}

/**
 * Снять отметку deliverable (кнопка «Назад» в шапке воронки).
 * @param {object} client
 * @param {PnkDeliverableKey | string} key
 */
export function clearPnkDeliverable(client, key) {
  if (!PNK_DELIVERABLE_KEYS.includes(/** @type {PnkDeliverableKey} */ (key))) {
    return { ok: false, error: 'Неизвестный пункт чеклиста', client }
  }
  const deliverables = parsePnkDeliverables(client?.pnk_deliverables)
  deliverables[key] = null
  return { ok: true, client: { ...client, pnk_deliverables: deliverables } }
}

/**
 * @param {object} client
 * @param {{ text: string, at?: string, by_role?: string, by_name?: string }} entry
 */
export function appendPnkComment(client, entry) {
  const text = String(entry?.text ?? '').trim().slice(0, 500)
  if (!text) return { ok: false, error: 'Введите комментарий', client }
  const list = parsePnkComments(client?.pnk_comments)
  list.push({
    at: entry.at || new Date().toISOString(),
    text,
    by_role: entry.by_role,
    by_name: entry.by_name,
  })
  const last = text
  return {
    ok: true,
    client: {
      ...client,
      pnk_comments: list.slice(-40),
      pnk_comment: last,
    },
  }
}

/**
 * @param {object} input
 * @returns {{ ok: true, client: object } | { ok: false, error: string }}
 */
export function applyPnkStagePatch(input = {}) {
  const client = input.client && typeof input.client === 'object' ? { ...input.client } : null
  if (!client) return { ok: false, error: 'Нет клиента' }

  const nextStage = input.stage != null ? String(input.stage) : null
  if (nextStage && !isPnkStage(nextStage)) return { ok: false, error: 'Неизвестный этап' }

  const from = isPnkStage(client.pnk_stage) ? client.pnk_stage : 'new'
  if (nextStage && !canAdvancePnkStage(from, /** @type {PnkStage} */ (nextStage))) {
    return { ok: false, error: `Нельзя перейти с «${PNK_STAGE_LABELS[from]}» на «${PNK_STAGE_LABELS[nextStage]}»` }
  }

  if (nextStage) client.pnk_stage = nextStage

  if (client.pnk_stage === 'won' && nextStage === 'won') {
    if (input.require_dk_membership === true && input.has_dk_membership !== true) {
      return {
        ok: false,
        error: 'Сначала оформите платный абонемент (ДК) во вкладке «Абонементы»',
      }
    }
  }

  if (input.trial_date != null) {
    const d = String(input.trial_date).slice(0, 10)
    if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) return { ok: false, error: 'Некорректная дата пробной' }
    client.pnk_trial_date = d || null
  }
  if (input.trial_time != null) {
    const t = String(input.trial_time).trim().slice(0, 8)
    client.pnk_trial_time = t || null
  }
  if (input.trainer_id != null) {
    const tid = String(input.trainer_id).trim()
    if (!tid) return { ok: false, error: 'Укажите тренера' }
    client.trainer_id = tid
  }

  if (input.deliverable && PNK_DELIVERABLE_KEYS.includes(input.deliverable)) {
    const marked = markPnkDeliverable(client, input.deliverable, input.deliverable_at)
    if (!marked.ok) return marked
    Object.assign(client, marked.client)
  }

  if (input.clear_deliverable && PNK_DELIVERABLE_KEYS.includes(input.clear_deliverable)) {
    const cleared = clearPnkDeliverable(client, input.clear_deliverable)
    if (!cleared.ok) return cleared
    Object.assign(client, cleared.client)
  }

  if (input.comment) {
    const c = appendPnkComment(client, {
      text: input.comment,
      by_role: input.by_role,
      by_name: input.by_name,
    })
    if (!c.ok) return c
    Object.assign(client, c.client)
  }

  if (client.pnk_stage === 'assigned' && client.trainer_id && from === 'new') {
    /* ok */
  }
  if (client.pnk_stage === 'contact' || input.deliverable === 'contact') {
    const d = parsePnkDeliverables(client.pnk_deliverables)
    if (!d.contact) {
      const m = markPnkDeliverable(client, 'contact')
      Object.assign(client, m.client)
    }
  }
  if (client.pnk_stage === 'agreed' && !client.pnk_trial_date) {
    return { ok: false, error: 'Укажите дату пробной' }
  }
  if (client.pnk_stage === 'trial_done') {
    const d = parsePnkDeliverables(client.pnk_deliverables)
    if (!d.trial) {
      const m = markPnkDeliverable(client, 'trial')
      Object.assign(client, m.client)
    }
  }
  // После бесплатной в зале — «начало визита» не должно висеть серым на доске менеджера.
  if (
    input.deliverable === 'trial' ||
    input.deliverable === 'trial2' ||
    client.pnk_stage === 'trial_done'
  ) {
    const d = parsePnkDeliverables(client.pnk_deliverables)
    if (!d.visit_started) {
      const m = markPnkDeliverable(client, 'visit_started')
      Object.assign(client, m.client)
    }
  }
  if (client.pnk_stage === 'followup' || input.deliverable === 'followup') {
    const d = parsePnkDeliverables(client.pnk_deliverables)
    if (!d.followup) {
      const m = markPnkDeliverable(client, 'followup')
      Object.assign(client, m.client)
    }
  }

  if (client.pnk_stage === 'won') {
    client.lifecycle = 'active'
    client.pnk_won_at = input.won_at || new Date().toISOString()
    client.pnk_lost_at = null
    client.pnk_lost_reason = null
  } else if (client.pnk_stage === 'lost') {
    client.lifecycle = 'pnk_lost'
    client.pnk_lost_at = input.lost_at || new Date().toISOString()
    client.pnk_lost_reason = String(input.lost_reason ?? '').trim().slice(0, 200) || null
  } else if (client.lifecycle !== 'pnk') {
    client.lifecycle = 'pnk'
  }

  return { ok: true, client }
}

/**
 * Начальное состояние нового ПНК.
 * @param {object} base — поля клиента (name, phone, trainer_id, club_id, …)
 */
export function buildNewPnkClientFields(base = {}) {
  const trainerId = String(base.trainer_id ?? '').trim()
  const stage = trainerId ? 'assigned' : 'new'
  const sessions = Number(base.pnk_trial_sessions) === 2 ? 2 : 1
  return {
    lifecycle: 'pnk',
    pnk_stage: stage,
    pnk_source: String(base.pnk_source ?? 'manager').slice(0, 40) || 'manager',
    pnk_trial_sessions: sessions,
    pnk_trial_date: null,
    pnk_trial_time: null,
    pnk_comment: null,
    pnk_comments: [],
    pnk_deliverables: {
      contact: null,
      health: null,
      nutrition: null,
      trial: null,
      homework: null,
      trial2: null,
      homework2: null,
      followup: null,
    },
    pnk_won_at: null,
    pnk_lost_at: null,
    pnk_lost_reason: null,
    pnk_created_at: base.pnk_created_at || new Date().toISOString(),
  }
}

/**
 * Пакет после пробной: питание + ДЗ.
 * @param {object} client
 */
export function pnkPackageProgress(client) {
  const d = parsePnkDeliverables(client?.pnk_deliverables)
  const nutrition = Boolean(d.nutrition)
  const homework = Boolean(d.homework)
  return {
    nutrition,
    homework,
    done: nutrition && homework,
    doneCount: (nutrition ? 1 : 0) + (homework ? 1 : 0),
    total: 2,
  }
}

/**
 * @param {object} client
 * @param {Date} [now]
 * @param {{ bzCompletedCount?: number, healthCard?: object | null }} [ctx]
 * @returns {{ code: string, label: string, tone: 'ok'|'warn'|'hot' }[]}
 */
export function buildPnkAttentionFlags(client, now = new Date(), ctx = {}) {
  if (!isOpenPnkClient(client)) return []
  const flags = []
  const stage = client.pnk_stage
  const d = parsePnkDeliverables(client.pnk_deliverables)
  const bzDone = Math.max(0, Number(ctx.bzCompletedCount) || 0)
  const created = Date.parse(String(client.pnk_created_at ?? client.created_at ?? ''))
  const t = now.getTime()

  if ((stage === 'new' || stage === 'assigned') && !d.contact) {
    const ageH = Number.isFinite(created) ? (t - created) / 3600000 : 0
    flags.push({
      code: 'need_contact',
      label: ageH >= PNK_CONTACT_SLA_HOURS ? 'Нужен звонок / Max' : 'Ждёт касания',
      tone: ageH >= PNK_CONTACT_SLA_HOURS ? 'hot' : 'warn',
    })
  }

  if (stage === 'contact' && !client.pnk_trial_date) {
    flags.push({ code: 'need_date', label: 'Нет даты пробной', tone: 'warn' })
  }

  const trialDate = String(client.pnk_trial_date ?? '').slice(0, 10)
  // Неявка только до старта визита: если клиент уже «пришёл» / в пакете — не висим
  const visitUnderway = Boolean(
    d.visit_started ||
      d.health ||
      d.nutrition ||
      d.trial ||
      d.homework ||
      d.trial2 ||
      d.homework2 ||
      bzDone >= 1,
  )
  if (trialDate && /^\d{4}-\d{2}-\d{2}$/.test(trialDate) && !d.trial && !visitUnderway && bzDone < 1) {
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    if (trialDate < today) {
      flags.push({
        code: 'noshow',
        label: 'Неявка: продолжаем?',
        tone: 'hot',
      })
    } else if (trialDate === today) {
      flags.push({ code: 'trial_today', label: 'Пробная сегодня', tone: 'warn' })
    }
  }

  if ((stage === 'trial_done' || d.trial || bzDone >= 1) && !d.followup) {
    const wiz = resolvePnkWizardStep(client, ctx)
    if (wiz?.key === 'followup' || wiz?.key === 'close') {
      const pkg = pnkPackageProgress(client)
      if (!pkg.done) {
        flags.push({
          code: 'need_package',
          label: !pkg.nutrition && !pkg.homework ? 'Нет питания и ДЗ' : !pkg.nutrition ? 'Нет питания' : 'Нет ДЗ',
          tone: 'warn',
        })
      }
      flags.push({
        code: 'need_followup',
        label: 'Нужно уточнить с клиентом',
        tone: 'warn',
      })
    }
  }

  return flags
}

/**
 * Прогресс полоски этапов (0…100) для UI как у Dispatch.
 * @param {object} client
 */
export function buildPnkStageProgress(client) {
  const stage = isPnkStage(client?.pnk_stage) ? client.pnk_stage : 'new'
  if (stage === 'lost') {
    return { pct: 100, label: PNK_STAGE_LABELS.lost, tone: 'lost', step: -1, stages: PNK_STAGES }
  }
  if (stage === 'won') {
    return { pct: 100, label: PNK_STAGE_LABELS.won, tone: 'won', step: PNK_STAGES.indexOf('won'), stages: PNK_STAGES }
  }
  const open = PNK_STAGES.filter((s) => s !== 'won' && s !== 'lost')
  const idx = Math.max(0, open.indexOf(stage))
  const pct = Math.round((idx / Math.max(open.length - 1, 1)) * 100)
  return {
    pct,
    label: PNK_STAGE_LABELS[stage],
    tone: 'active',
    step: idx,
    stages: open,
  }
}

/** Открытые этапы для полоски пути (без won/lost). new схлопнут в assigned. */
export const PNK_OPEN_STAGES = /** @type {PnkStage[]} */ ([
  'assigned',
  'agreed',
  'trial_done',
  'followup',
])

/**
 * Подсказка следующего шага — через мастер (1|2 бесплатные).
 * @param {object} client
 * @param {{ healthCard?: object | null, bzCompletedCount?: number, healthComplete?: boolean }} [ctx]
 */
export function pnkNextActionHint(client, ctx = {}) {
  const step = resolvePnkTrainerUiStep(client, ctx)
  if (!step) return null
  return { key: step.key, label: step.label }
}

/**
 * Текущий шаг UI для тренера / доски / glance.
 * @param {object} client
 * @param {{ healthCard?: object | null, bzCompletedCount?: number, healthComplete?: boolean }} [ctx]
 */
export function resolvePnkTrainerUiStep(client, ctx = {}) {
  const step = resolvePnkWizardStep(client, ctx)
  if (!step) return null
  return {
    key: step.key,
    n: step.n,
    total: step.total,
    title: step.title,
    help: step.help,
    label: step.label,
    tab: step.tab,
    sessions: step.sessions,
    steps: step.steps,
  }
}

/** @deprecated */
export const PNK_TRAINER_STEP_META = {}

/**
 * День визита относительно даты пробной (пока trial не отмечен).
 * @param {object} client
 * @param {Date} [now]
 * @returns {'none'|'before'|'today'|'past'}
 */
export function resolvePnkVisitDayState(client, now = new Date()) {
  const d = parsePnkDeliverables(client?.pnk_deliverables)
  if (d.trial || client?.pnk_stage === 'trial_done') return 'none'
  const trialDate = String(client?.pnk_trial_date ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trialDate)) return 'none'
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  if (trialDate > today) return 'before'
  if (trialDate === today) return 'today'
  return 'past'
}

/**
 * Строгая последовательность: видна только вкладка текущего шага мастера.
 * @param {object} client
 * @param {string} tabId
 * @param {{ healthCard?: object | null, bzCompletedCount?: number, healthComplete?: boolean, now?: Date }} [ctx]
 */
export function isPnkCardTabVisible(client, tabId, ctx = {}) {
  const id = String(tabId ?? '')
  if (!isOpenPnkClient(client)) return true
  if (id === 'stats' || id === 'loyalty') return false
  const step = resolvePnkWizardStep(client, ctx)
  if (!step) return false
  // Оформление: нужна вкладка абонементов, чтобы выдать ДК до «Оформлен»
  if (step.key === 'close' && id === 'memberships') return true
  if (!step.tab) return false
  return step.tab === id
}

/** Фильтры доски менеджера */
export const PNK_BOARD_FILTERS = [
  { id: 'all', label: 'Все' },
  { id: 'attention', label: 'Внимание' },
  { id: 'call', label: 'Ждут звонка' },
  { id: 'date', label: 'С датой' },
  { id: 'trial', label: 'После пробной' },
]

/**
 * @param {object} client
 * @param {string} filterId
 * @param {Set<string>} [attentionIds]
 */
export function matchesPnkBoardFilter(client, filterId, attentionIds) {
  const id = String(filterId ?? 'all')
  if (id === 'all') return true
  if (id === 'attention') return attentionIds?.has(String(client?.id)) === true
  const d = parsePnkDeliverables(client?.pnk_deliverables)
  if (id === 'call') return !d.contact
  if (id === 'date') return Boolean(client?.pnk_trial_date)
  if (id === 'trial') return Boolean(d.trial) || client?.pnk_stage === 'trial_done'
  return true
}

/**
 * Имя для демо-сценария (менеджер создаёт ПНК).
 */
export function buildPnkDemoScenarioForm(trainerId = '') {
  return {
    name: 'Сценарий ПНК Иванов',
    phone: '+79001234567',
    card_number: '',
    trainer_id: String(trainerId ?? '').trim(),
  }
}
