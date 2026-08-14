/**
 * Исход звонка после webhook Мои Звонки (call.finish) + подписи в журнале.
 * status ok|fail = команда API; outcome = факт разговора с Android.
 */

export const CLUB_CALL_OUTCOMES = ['pending', 'answered', 'missed', 'short', 'unknown']

/** Секунды: короче — «короткий» сброс (типичный недозвон Android). */
export const CLUB_CALL_SHORT_DURATION_SEC = 5

/** Окно сопоставления finish ↔ наша команда make_call. */
export const CLUB_CALL_FINISH_MATCH_WINDOW_MS = 45 * 60 * 1000

/** Макс. длина URL записи в БД / UI. */
export const CLUB_CALL_RECORDING_URL_MAX = 500

/**
 * Только http(s) ссылка на запись; иначе null.
 * Относительный путь — с baseOrigin (например https://fitcity.moizvonki.ru).
 * @param {unknown} raw
 * @param {string} [baseOrigin]
 * @returns {string | null}
 */
export function normalizeClubCallRecordingUrl(raw, baseOrigin = '') {
  let s = String(raw ?? '').trim()
  if (!s) return null
  if (s.startsWith('//')) s = `https:${s}`
  const base = String(baseOrigin ?? '')
    .trim()
    .replace(/\/$/, '')
  if (!/^https?:\/\//i.test(s) && base && s.startsWith('/')) {
    s = `${base}${s}`
  }
  if (!/^https?:\/\//i.test(s)) return null
  if (s.length > CLUB_CALL_RECORDING_URL_MAX) return s.slice(0, CLUB_CALL_RECORDING_URL_MAX)
  return s
}

/**
 * Сырое поле записи из event Мои Звонки (разные имена в доках/интеграциях).
 * @param {Record<string, unknown>} event
 */
export function pickMoiZvonkiRecordingRaw(event) {
  if (!event || typeof event !== 'object') return ''
  const keys = [
    'recording',
    'recording_url',
    'record_url',
    'record',
    'call_record',
    'audio_url',
    'file_url',
    'file',
  ]
  for (const k of keys) {
    const v = event[k]
    if (v == null || v === '') continue
    if (typeof v === 'object' && v !== null && 'url' in v) {
      const u = String(/** @type {{ url?: unknown }} */ (v).url ?? '').trim()
      if (u) return u
    }
    const s = String(v).trim()
    if (s) return s
  }
  return ''
}

/** @param {string | null | undefined} raw */
export function normalizeCallOutcomePhone(raw) {
  let d = String(raw ?? '').replace(/\D/g, '')
  if (d.length === 11 && d.startsWith('8')) d = `7${d.slice(1)}`
  if (d.length === 10) d = `7${d}`
  return d
}

/**
 * @param {unknown} raw
 * @returns {'pending' | 'answered' | 'missed' | 'short' | 'unknown'}
 */
export function normalizeClubCallOutcome(raw) {
  const s = String(raw ?? '').trim().toLowerCase()
  if (s === 'answered' || s === 'missed' || s === 'short' || s === 'unknown') return s
  return 'pending'
}

/**
 * @param {{ answered?: unknown, duration_sec?: unknown, duration?: unknown }} input
 */
export function deriveClubCallOutcome(input = {}) {
  const answeredRaw = input.answered
  const answered =
    answeredRaw === true ||
    answeredRaw === 1 ||
    answeredRaw === '1' ||
    String(answeredRaw).toLowerCase() === 'true'
  const durationSec = Math.max(
    0,
    Math.floor(Number(input.duration_sec ?? input.duration ?? 0) || 0),
  )
  if (answered) return { outcome: 'answered', answered: true, duration_sec: durationSec }
  if (durationSec > 0 && durationSec < CLUB_CALL_SHORT_DURATION_SEC) {
    return { outcome: 'short', answered: false, duration_sec: durationSec }
  }
  if (durationSec > 0 || answeredRaw === false || answeredRaw === 0 || answeredRaw === '0') {
    return { outcome: 'missed', answered: false, duration_sec: durationSec }
  }
  return { outcome: 'unknown', answered: false, duration_sec: durationSec || null }
}

/**
 * Подпись команды API (не исход разговора).
 * @param {'ok' | 'fail'} status
 */
export function clubCallCommandStatusLabel(status) {
  return status === 'fail' ? 'Ошибка' : 'Команда ушла'
}

/**
 * @param {{
 *   status?: string,
 *   outcome?: string | null,
 *   duration_sec?: number | null,
 *   answered?: boolean | null,
 * }} row
 */
export function clubCallJournalStatusLabel(row) {
  const status = String(row?.status ?? 'ok').toLowerCase() === 'fail' ? 'fail' : 'ok'
  if (status === 'fail') return 'Ошибка'
  const outcome = normalizeClubCallOutcome(row?.outcome)
  const dur = Number(row?.duration_sec)
  const durLabel = Number.isFinite(dur) && dur > 0 ? ` · ${dur} с` : ''
  if (outcome === 'answered') return `Отвечен${durLabel}`
  if (outcome === 'short') return `Короткий${durLabel}`
  if (outcome === 'missed') return `Пропущен${durLabel}`
  if (outcome === 'unknown' && Number.isFinite(dur) && dur >= 0) return `Исход${durLabel}`
  return 'Команда ушла'
}

/**
 * @param {object} row
 */
export function clubCallJournalStatusTone(row) {
  const status = String(row?.status ?? 'ok').toLowerCase() === 'fail' ? 'fail' : 'ok'
  if (status === 'fail') return 'fail'
  const outcome = normalizeClubCallOutcome(row?.outcome)
  if (outcome === 'answered') return 'answered'
  if (outcome === 'short') return 'short'
  if (outcome === 'missed') return 'missed'
  return 'command'
}

/**
 * Разбор тела webhook Мои Звонки.
 * @param {unknown} body
 */
export function parseMoiZvonkiWebhookBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'invalid_body' }
  }
  const wh = /** @type {{ webhook?: Record<string, unknown>, event?: Record<string, unknown> }} */ (
    body
  )
  const webhook = wh.webhook && typeof wh.webhook === 'object' ? wh.webhook : null
  const event = wh.event && typeof wh.event === 'object' ? wh.event : null
  if (!webhook || !event) return { ok: false, error: 'missing_webhook_or_event' }
  const action = String(webhook.action ?? '').trim()
  return {
    ok: true,
    action,
    user_login: String(webhook.user_login ?? '').trim().toLowerCase(),
    account_id: String(webhook.account_id ?? '').trim(),
    event,
  }
}

/**
 * @param {Record<string, unknown>} event
 */
export function shapeCallFinishFromMoiZvonkiEvent(event, opts = {}) {
  const phone = normalizeCallOutcomePhone(
    String(event.client_number ?? event.to ?? event.phone ?? ''),
  )
  const answeredRaw = event.answered
  const derived = deriveClubCallOutcome({
    answered: answeredRaw,
    duration_sec: event.duration,
  })
  const startTs = Number(event.start_time)
  const endTs = Number(event.end_time)
  const baseOrigin = String(opts.baseOrigin ?? '').trim()
  return {
    phone,
    ...derived,
    mz_db_call_id: event.db_call_id != null ? String(event.db_call_id) : null,
    mz_pbx_call_id: event.event_pbx_call_id != null ? String(event.event_pbx_call_id) : null,
    src_number: event.src_number != null ? String(event.src_number).replace(/\D/g, '').slice(0, 20) : null,
    start_time_ms: Number.isFinite(startTs) && startTs > 0 ? startTs * (startTs < 1e12 ? 1000 : 1) : null,
    end_time_ms: Number.isFinite(endTs) && endTs > 0 ? endTs * (endTs < 1e12 ? 1000 : 1) : null,
    recording_url: normalizeClubCallRecordingUrl(pickMoiZvonkiRecordingRaw(event), baseOrigin),
  }
}

/**
 * @param {Array<object>} candidates
 * @param {{ phone: string, start_time_ms?: number | null, end_time_ms?: number | null, nowMs?: number }} opts
 */
export function pickClubCallLogRowForFinish(candidates, opts) {
  const phone = normalizeCallOutcomePhone(opts.phone)
  if (!phone) return null
  const anchor =
    opts.start_time_ms ||
    opts.end_time_ms ||
    opts.nowMs ||
    Date.now()
  const windowMs = CLUB_CALL_FINISH_MATCH_WINDOW_MS

  /** @type {Array<{ row: object, score: number }>} */
  const scored = []
  for (const row of candidates ?? []) {
    if (String(row?.status ?? 'ok').toLowerCase() === 'fail') continue
    if (row?.finished_at) continue
    const rowPhone = normalizeCallOutcomePhone(row?.phone)
    if (!rowPhone || rowPhone !== phone) continue
    const createdMs = Date.parse(String(row?.created_at ?? ''))
    if (!Number.isFinite(createdMs)) continue
    const delta = anchor - createdMs
    if (delta < -120_000 || delta > windowMs) continue
    // Ближе к старту звонка — лучше; команда обычно чуть раньше start.
    const score = Math.abs(delta)
    scored.push({ row, score })
  }
  scored.sort((a, b) => a.score - b.score)
  return scored[0]?.row ?? null
}

/**
 * @param {ReturnType<typeof shapeCallFinishFromMoiZvonkiEvent>} finish
 */
export function buildClubCallFinishPatch(finish) {
  const finishedAt = finish.end_time_ms
    ? new Date(finish.end_time_ms).toISOString()
    : new Date().toISOString()
  return {
    outcome: finish.outcome,
    answered: finish.answered === true,
    duration_sec: finish.duration_sec != null ? finish.duration_sec : null,
    mz_db_call_id: finish.mz_db_call_id,
    mz_pbx_call_id: finish.mz_pbx_call_id,
    src_number: finish.src_number,
    finished_at: finishedAt,
    recording_url: finish.recording_url || null,
  }
}

/**
 * @param {string} expected
 * @param {string} got
 */
export function moiZvonkiWebhookSecretMatches(expected, got) {
  const a = String(expected ?? '').trim()
  const b = String(got ?? '').trim()
  if (!a || a.length < 16) return false
  return a === b
}
