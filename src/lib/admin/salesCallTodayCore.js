/**
 * Очередь «кому звонить сегодня» — из журнала звонков и пометок.
 * Чистые правила (без React/IDB). Glance на главной менеджера / сети.
 */

import { clubCallJournalStatusLabel } from './clubCallOutcomeCore.js'

export const CALL_TODAY_LOOKBACK_DAYS = 30
export const CALL_TODAY_MAX_ITEMS = 8
export const CALL_TODAY_MISS_DAYS = 5
/** Не предлагать перезвон, пока команда «в полёте» (ожидаем webhook). */
export const CALL_TODAY_PENDING_HOURS = 2

/** @typedef {'note_callback' | 'note' | 'missed' | 'short'} CallTodayReasonKind */

const CALLBACK_NOTE_RE =
  /перезвон|перезвонить|сегодня|завтра|думает|ждёт|ждет|обещал|интересно|не\s*брал|занят|через\s*\d|пятниц|понедельник|вторник|сред|четверг|суббот|воскресень/i

/** Пометка «закрыто» — не тащить в очередь. */
const DONE_NOTE_RE =
  /не\s*звон|не\s*надо|отказ|отказал|не\s*интерес|закрыт[оа]?|спам|ошибочн|не\s*тот|дубл/i

/**
 * Есть ли в пометке сигнал «нужен перезвон / следующий шаг».
 * @param {unknown} note
 */
export function detectCallNoteCallbackIntent(note) {
  const t = String(note ?? '').trim()
  if (!t) return false
  if (DONE_NOTE_RE.test(t)) return false
  return CALLBACK_NOTE_RE.test(t)
}

/**
 * Пометка снимает человека с очереди.
 * @param {unknown} note
 */
export function detectCallNoteDoneIntent(note) {
  const t = String(note ?? '').trim()
  if (!t) return false
  return DONE_NOTE_RE.test(t)
}

/**
 * @param {unknown} raw
 * @returns {CallTodayReasonKind | ''}
 */
export function normalizeCallTodayReasonKind(raw) {
  const s = String(raw ?? '').trim().toLowerCase()
  if (s === 'note_callback' || s === 'note' || s === 'missed' || s === 'short') return s
  return ''
}

/**
 * @param {CallTodayReasonKind | string} kind
 * @param {{ staff_note?: string | null, outcome?: string | null }} [row]
 */
export function callTodayReasonLabel(kind, row = {}) {
  const k = normalizeCallTodayReasonKind(kind)
  const note = String(row.staff_note ?? '').trim()
  if (k === 'note_callback' || k === 'note') {
    if (note) return note.length > 72 ? `${note.slice(0, 71)}…` : note
    return 'Есть пометка'
  }
  if (k === 'missed') return 'Не взял — перезвонить'
  if (k === 'short') return 'Сброс — уточнить'
  return clubCallJournalStatusLabel(row) || 'Звонок'
}

/**
 * Приоритет причины (больше = важнее).
 * @param {CallTodayReasonKind | string} kind
 */
export function callTodayReasonScore(kind) {
  const k = normalizeCallTodayReasonKind(kind)
  if (k === 'note_callback') return 100
  if (k === 'note') return 70
  if (k === 'missed') return 50
  if (k === 'short') return 40
  return 0
}

/**
 * Оценка одной строки без учёта «новее ответили».
 * @param {object} row
 * @param {{ nowMs?: number }} [opts]
 * @returns {{ kind: CallTodayReasonKind, score: number } | null}
 */
export function scoreCallLogForTodayQueue(row, opts = {}) {
  if (!row || String(row.status ?? 'ok') === 'fail') return null
  const clientId = String(row.client_id ?? '').trim()
  if (!clientId) return null

  const note = String(row.staff_note ?? '').trim()
  if (note) {
    if (detectCallNoteDoneIntent(note)) return null
    if (detectCallNoteCallbackIntent(note)) {
      return { kind: 'note_callback', score: callTodayReasonScore('note_callback') }
    }
    return { kind: 'note', score: callTodayReasonScore('note') }
  }

  const outcome = String(row.outcome ?? 'pending').trim().toLowerCase()
  const createdMs = Date.parse(String(row.created_at ?? '')) || 0
  const nowMs = Number(opts.nowMs) > 0 ? Number(opts.nowMs) : Date.now()
  const ageDays = createdMs > 0 ? (nowMs - createdMs) / (24 * 60 * 60 * 1000) : 999

  if (outcome === 'missed' && ageDays <= CALL_TODAY_MISS_DAYS) {
    return { kind: 'missed', score: callTodayReasonScore('missed') }
  }
  if (outcome === 'short' && ageDays <= CALL_TODAY_MISS_DAYS) {
    return { kind: 'short', score: callTodayReasonScore('short') }
  }
  return null
}

/**
 * Один клиент: смотрим от новых к старым.
 * - свежий pending → не звонить снова (в полёте)
 * - answered без «перезвонить» → снят с очереди (даже если раньше был missed)
 * - done-пометка → снят
 * - иначе первая подходящая причина
 *
 * @param {object[]} clientLogs
 * @param {{ nowMs?: number }} [opts]
 * @returns {{ kind: CallTodayReasonKind, score: number, row: object, createdMs: number } | null}
 */
export function pickCallTodayEntryForClient(clientLogs, opts = {}) {
  const nowMs = Number(opts.nowMs) > 0 ? Number(opts.nowMs) : Date.now()
  const list = (Array.isArray(clientLogs) ? clientLogs : [])
    .filter((r) => r && String(r.status ?? 'ok') !== 'fail')
    .slice()
    .sort((a, b) => {
      const ta = Date.parse(String(a.created_at ?? '')) || 0
      const tb = Date.parse(String(b.created_at ?? '')) || 0
      return tb - ta
    })

  for (const row of list) {
    const createdMs = Date.parse(String(row.created_at ?? '')) || 0
    const ageMs = createdMs > 0 ? nowMs - createdMs : Number.POSITIVE_INFINITY
    const ageHours = ageMs / (60 * 60 * 1000)
    const note = String(row.staff_note ?? '').trim()
    const outcome = String(row.outcome ?? 'pending').trim().toLowerCase()

    if (note && detectCallNoteDoneIntent(note)) {
      return null
    }

    if (note) {
      const scored = scoreCallLogForTodayQueue(row, { nowMs })
      if (scored) {
        return { ...scored, row, createdMs }
      }
    }

    if (outcome === 'pending' && ageHours <= CALL_TODAY_PENDING_HOURS) {
      return null
    }

    if (outcome === 'answered') {
      return null
    }

    const scored = scoreCallLogForTodayQueue(row, { nowMs })
    if (scored) {
      return { ...scored, row, createdMs }
    }
  }

  return null
}

/**
 * Собирает очередь: один клиент — одна лучшая строка.
 *
 * @param {object[]} logs
 * @param {{
 *   nowMs?: number,
 *   maxItems?: number,
 *   clientsBasePath?: string,
 *   clubId?: string,
 *   archivedClientIds?: Iterable<string>,
 * }} [opts]
 * @returns {{ items: object[], total: number }}
 */
export function buildCallTodayGlance(logs, opts = {}) {
  const list = Array.isArray(logs) ? logs : []
  const nowMs = Number(opts.nowMs) > 0 ? Number(opts.nowMs) : Date.now()
  const maxItems = Math.max(1, Math.min(20, Math.floor(Number(opts.maxItems) || CALL_TODAY_MAX_ITEMS)))
  const clientsBase = String(opts.clientsBasePath ?? '/sales/clients').replace(/\/$/, '') || '/sales/clients'
  const clubId = String(opts.clubId ?? '').trim()
  const archived = new Set(
    [...(opts.archivedClientIds ?? [])].map((id) => String(id ?? '').trim()).filter(Boolean),
  )

  /** @type {Map<string, object[]>} */
  const byClient = new Map()
  for (const row of list) {
    const clientId = String(row?.client_id ?? '').trim()
    if (!clientId || archived.has(clientId)) continue
    const bucket = byClient.get(clientId)
    if (bucket) bucket.push(row)
    else byClient.set(clientId, [row])
  }

  /** @type {Array<{ kind: CallTodayReasonKind, score: number, row: object, createdMs: number }>} */
  const picked = []
  for (const rows of byClient.values()) {
    const entry = pickCallTodayEntryForClient(rows, { nowMs })
    if (entry) picked.push(entry)
  }

  picked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return b.createdMs - a.createdMs
  })

  const items = picked.slice(0, maxItems).map((entry, index) => {
    const row = entry.row
    const clientId = String(row.client_id ?? '')
    const qs = new URLSearchParams()
    if (clubId) qs.set('club', clubId)
    qs.set('from', 'call-today')
    const q = qs.toString()
    return {
      id: String(row.id ?? `${clientId}-${index}`),
      log_id: row.id ? String(row.id) : null,
      client_id: clientId,
      client_name: String(row.client_name ?? '').trim() || 'Клиент',
      phone: String(row.phone ?? ''),
      reason_kind: entry.kind,
      reason: callTodayReasonLabel(entry.kind, row),
      staff_note: row.staff_note ? String(row.staff_note) : null,
      outcome: String(row.outcome ?? 'pending'),
      last_call_at: String(row.created_at ?? ''),
      tone: entry.kind === 'note_callback' || entry.kind === 'missed' ? 'hot' : 'warn',
      href: `${clientsBase}/${encodeURIComponent(clientId)}${q ? `?${q}` : ''}`,
      index: index + 1,
      total: Math.min(picked.length, maxItems),
    }
  })

  return { items, total: picked.length }
}

/**
 * Подпись для UI glance.
 * @param {{ total?: number }} glance
 */
export function callTodayGlanceEyebrow(glance) {
  const n = Math.max(0, Number(glance?.total) || 0)
  if (n <= 0) return 'Кому звонить'
  if (n === 1) return 'Кому звонить сегодня'
  return `Кому звонить · ${n}`
}
