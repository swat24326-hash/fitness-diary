/**
 * ИСКРА — ядро самообучения: сигналы, агрегация, playbooks, ранжирование.
 * Чистые функции без React/IDB — тестируются из verify-iskra-learning.mjs.
 */

/** @typedef {'collect' | 'apply' | 'full'} IskraLearningPhase */

/** Фазы включения: сейчас collect+apply локально, cloud sync по миграции. */
export const ISKRA_LEARNING_PHASE = /** @type {IskraLearningPhase} */ ('apply')

export const ISKRA_LEARNING_MIN_PLAYBOOK_POSITIVE = 3
export const ISKRA_LEARNING_PLAYBOOK_SCORE_THRESHOLD = 2.5

/** @typedef {'feedback_up' | 'feedback_down' | 'hint_click' | 'chip_click' | 'correction' | 'playbook_confirm'} IskraLearningEventType */

/** @type {Record<IskraLearningEventType, { weight: number, kind: 'engagement' | 'feedback' | 'curation' }>} */
export const ISKRA_LEARNING_EVENT_WEIGHTS = {
  feedback_up: { weight: 1, kind: 'feedback' },
  feedback_down: { weight: -1.2, kind: 'feedback' },
  hint_click: { weight: 0.6, kind: 'engagement' },
  chip_click: { weight: 0.5, kind: 'engagement' },
  correction: { weight: -0.8, kind: 'curation' },
  playbook_confirm: { weight: 2, kind: 'curation' },
}

/**
 * @typedef {{
 *   signal_key: string,
 *   positive_count: number,
 *   negative_count: number,
 *   engagement_count: number,
 *   score: number,
 *   playbook_note?: string,
 *   playbook_confirmed?: boolean,
 *   last_event_at?: string,
 * }} IskraLearningSignal
 */

/**
 * @typedef {{
 *   signals: IskraLearningSignal[],
 *   playbooks: Array<{ signal_key: string, note: string }>,
 *   phase: IskraLearningPhase,
 * }} IskraLearningBundle
 */

/**
 * @param {'hint' | 'chip' | 'topic' | 'reply'} kind
 * @param {string} id
 */
export function buildLearningSignalKey(kind, id) {
  const slug = String(id ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_а-яё-]/gi, '')
    .slice(0, 64)
  return `${kind}:${slug || 'general'}`
}

/**
 * @param {string} userMessage
 * @param {{ chip_id?: string, handler_id?: string, intro_kind?: string }} [meta]
 */
export function deriveReplySignalKey(userMessage, meta = {}) {
  const chip = String(meta.chip_id ?? meta.handler_id ?? '').trim()
  if (chip) return buildLearningSignalKey('chip', chip)
  const intro = String(meta.intro_kind ?? '').trim()
  if (intro) return buildLearningSignalKey('topic', intro)
  const text = String(userMessage ?? '').toLowerCase()
  if (/план|продаж/.test(text)) return buildLearningSignalKey('topic', 'plan')
  if (/прогноз|forecast/.test(text)) return buildLearningSignalKey('topic', 'forecast')
  if (/риск|отклон/.test(text)) return buildLearningSignalKey('topic', 'risks')
  if (/что делать|совет|улучш/.test(text)) return buildLearningSignalKey('topic', 'advice')
  if (/тренер/.test(text)) return buildLearningSignalKey('topic', 'trainer')
  if (/клиент|абонемент|приложен|sync|синхрон/.test(text)) return buildLearningSignalKey('topic', 'app_guide')
  return buildLearningSignalKey('reply', 'freeform')
}

/**
 * @param {object} raw
 * @returns {{ ok: true, event: object } | { ok: false, error: string }}
 */
export function normalizeLearningEvent(raw) {
  const eventType = String(raw?.event_type ?? '').trim()
  if (!ISKRA_LEARNING_EVENT_WEIGHTS[eventType]) {
    return { ok: false, error: 'Неизвестный тип события обучения' }
  }
  const clubId = String(raw?.club_id ?? '').trim()
  if (!clubId) return { ok: false, error: 'Укажите club_id' }

  let signalKey = String(raw?.signal_key ?? '').trim()
  if (!signalKey) {
    signalKey = deriveReplySignalKey(raw?.user_message, {
      chip_id: raw?.chip_id,
      handler_id: raw?.handler_id,
      intro_kind: raw?.intro_kind,
    })
  }

  return {
    ok: true,
    event: {
      club_id: clubId,
      event_type: eventType,
      signal_key: signalKey,
      advisor_role_id: String(raw?.advisor_role_id ?? 'app_admin').trim() || 'app_admin',
      user_message: String(raw?.user_message ?? '').trim().slice(0, 500),
      note: String(raw?.note ?? '').trim().slice(0, 500),
      created_at: String(raw?.created_at ?? new Date().toISOString()),
      meta: raw?.meta && typeof raw.meta === 'object' ? raw.meta : {},
    },
  }
}

/**
 * @param {Array<object>} events
 * @returns {IskraLearningSignal[]}
 */
export function aggregateLearningSignals(events) {
  /** @type {Map<string, IskraLearningSignal>} */
  const map = new Map()

  for (const raw of events ?? []) {
    const normalized = normalizeLearningEvent(raw)
    if (!normalized.ok) continue
    const ev = normalized.event
    const def = ISKRA_LEARNING_EVENT_WEIGHTS[ev.event_type]
    const key = ev.signal_key
    const row =
      map.get(key) ??
      ({
        signal_key: key,
        positive_count: 0,
        negative_count: 0,
        engagement_count: 0,
        score: 0,
        playbook_note: '',
        playbook_confirmed: false,
        last_event_at: ev.created_at,
      })

    if (ev.event_type === 'feedback_up') row.positive_count += 1
    else if (ev.event_type === 'feedback_down' || ev.event_type === 'correction') row.negative_count += 1
    else if (ev.event_type === 'hint_click' || ev.event_type === 'chip_click') row.engagement_count += 1

    if (ev.event_type === 'playbook_confirm' && ev.note) {
      row.playbook_note = ev.note
      row.playbook_confirmed = true
      row.positive_count += 1
    }

    row.score = Number((row.score + def.weight).toFixed(3))
    if (ev.created_at && (!row.last_event_at || ev.created_at > row.last_event_at)) {
      row.last_event_at = ev.created_at
    }
    map.set(key, row)
  }

  return [...map.values()].sort((a, b) => b.score - a.score)
}

/**
 * @param {IskraLearningSignal} signal
 */
export function shouldPromoteToPlaybook(signal) {
  if (!signal || signal.playbook_confirmed) return false
  return (
    signal.positive_count >= ISKRA_LEARNING_MIN_PLAYBOOK_POSITIVE &&
    signal.score >= ISKRA_LEARNING_PLAYBOOK_SCORE_THRESHOLD
  )
}

/**
 * @param {IskraLearningSignal[]} signals
 */
export function extractLearningPlaybooks(signals) {
  const playbooks = []
  for (const s of signals ?? []) {
    if (s.playbook_confirmed && s.playbook_note) {
      playbooks.push({ signal_key: s.signal_key, note: s.playbook_note })
      continue
    }
    if (shouldPromoteToPlaybook(s)) {
      playbooks.push({
        signal_key: s.signal_key,
        note: `Тема «${s.signal_key}» часто помогает клубу — приоритет в ответах.`,
      })
    }
  }
  return playbooks.slice(0, 6)
}

/**
 * @param {IskraLearningBundle | null | undefined} bundle
 */
export function buildPlaybooksPromptBlock(bundle) {
  if (!bundle?.playbooks?.length) return null
  if (ISKRA_LEARNING_PHASE === 'collect') return null
  return bundle.playbooks.slice(0, 6).map((p) => ({
    signal_key: p.signal_key,
    note: p.note,
  }))
}

/**
 * @param {object} body
 * @returns {{ ok: true, payload: object } | { ok: false, error: string }}
 */
export function normalizePlaybookSave(body) {
  const clubId = String(body?.club_id ?? '').trim()
  const signalKey = String(body?.signal_key ?? '').trim()
  const note = String(body?.note ?? '').trim().slice(0, 500)
  const confirmed = body?.confirmed === true
  if (!clubId) return { ok: false, error: 'Укажите club_id' }
  if (!signalKey) return { ok: false, error: 'Укажите signal_key' }
  if (!note) return { ok: false, error: 'Введите текст урока' }
  return { ok: true, payload: { clubId, signalKey, note, confirmed } }
}

/**
 * @param {object | null | undefined} existing
 * @param {{ signal_key: string, note: string, confirmed?: boolean }} payload
 */
export function applyPlaybookNoteSave(existing, payload) {
  const now = new Date().toISOString()
  return {
    signal_key: payload.signal_key,
    positive_count: Number(existing?.positive_count) || 0,
    negative_count: Number(existing?.negative_count) || 0,
    engagement_count: Number(existing?.engagement_count) || 0,
    score: Number(existing?.score) || 0,
    playbook_note: String(payload.note ?? '').trim(),
    playbook_confirmed: payload.confirmed === true || existing?.playbook_confirmed === true,
    last_positive_at: existing?.last_positive_at ?? null,
    last_negative_at: existing?.last_negative_at ?? null,
    updated_at: now,
  }
}

/**
 * @param {IskraLearningBundle | null | undefined} bundle
 * @param {{ maxNotes?: number }} [opts]
 */
export function buildLearnedPromptAppend(bundle, opts = {}) {
  if (!bundle?.playbooks?.length) return ''
  if (ISKRA_LEARNING_PHASE === 'collect') return ''

  const maxNotes = Math.max(1, Number(opts.maxNotes) || 3)
  const lines = bundle.playbooks.slice(0, maxNotes).map((p) => `· ${p.note}`)
  if (!lines.length) return ''
  return `УРОКИ КЛУБА (самообучение ИСКРЫ, не противоречь без пометки): ${lines.join(' ')}`
}

/**
 * @param {Array<{ id: string }>} items
 * @param {IskraLearningSignal[]} signals
 * @param {'hint' | 'chip'} kind
 */
export function rankItemsByLearning(items, signals, kind) {
  if (!items?.length || ISKRA_LEARNING_PHASE === 'collect') return items ?? []
  const scoreByKey = new Map((signals ?? []).map((s) => [s.signal_key, s.score]))
  const prefix = `${kind}:`
  return [...items].sort((a, b) => {
    const sa = scoreByKey.get(`${prefix}${a.id}`) ?? 0
    const sb = scoreByKey.get(`${prefix}${b.id}`) ?? 0
    return sb - sa
  })
}

/**
 * @param {Array<{ id: string }>} hints
 * @param {IskraLearningSignal[]} signals
 */
export function rankProactiveHintsByLearning(hints, signals) {
  return rankItemsByLearning(hints, signals, 'hint')
}

/**
 * @param {object[]} rows from DB
 * @returns {IskraLearningBundle}
 */
export function buildLearningBundleFromRows(rows) {
  const signals = (rows ?? []).map((r) => ({
    signal_key: String(r.signal_key ?? ''),
    positive_count: Number(r.positive_count) || 0,
    negative_count: Number(r.negative_count) || 0,
    engagement_count: Number(r.engagement_count) || 0,
    score: Number(r.score) || 0,
    playbook_note: String(r.playbook_note ?? '').trim(),
    playbook_confirmed: r.playbook_confirmed === true,
    last_event_at: r.updated_at ?? r.last_positive_at ?? null,
  }))
  return {
    signals,
    playbooks: extractLearningPlaybooks(signals),
    phase: ISKRA_LEARNING_PHASE,
  }
}

/**
 * Применить дельту события к строке сигнала (upsert на сервере).
 * @param {object | null | undefined} existing
 * @param {object} event normalized event
 */
export function applyLearningEventToSignalRow(existing, event) {
  const def = ISKRA_LEARNING_EVENT_WEIGHTS[event.event_type]
  const now = new Date().toISOString()
  const row = {
    signal_key: event.signal_key,
    positive_count: Number(existing?.positive_count) || 0,
    negative_count: Number(existing?.negative_count) || 0,
    engagement_count: Number(existing?.engagement_count) || 0,
    score: Number(existing?.score) || 0,
    playbook_note: String(existing?.playbook_note ?? '').trim(),
    playbook_confirmed: existing?.playbook_confirmed === true,
    last_positive_at: existing?.last_positive_at ?? null,
    last_negative_at: existing?.last_negative_at ?? null,
    updated_at: now,
  }

  if (event.event_type === 'feedback_up') {
    row.positive_count += 1
    row.last_positive_at = now
  } else if (event.event_type === 'feedback_down' || event.event_type === 'correction') {
    row.negative_count += 1
    row.last_negative_at = now
  } else if (event.event_type === 'hint_click' || event.event_type === 'chip_click') {
    row.engagement_count += 1
  } else if (event.event_type === 'playbook_confirm') {
    row.playbook_confirmed = true
    row.playbook_note = event.note || row.playbook_note
    row.positive_count += 1
    row.last_positive_at = now
  }

  row.score = Number((row.score + def.weight).toFixed(3))
  return row
}
