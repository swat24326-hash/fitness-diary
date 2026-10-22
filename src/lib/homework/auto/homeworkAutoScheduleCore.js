/**
 * Авто-ДЗ по воскресеньям: настройки клиента (таблица homework_auto), неделя блока, причины паузы,
 * сборка снимка client_plans. Один модуль для планшета (предпросмотр) и сервера (cron) —
 * тренер видит ровно то, что уйдёт.
 */
import { HOMEWORK_AVOID, HOMEWORK_GOALS } from '../library/homeworkLibraryTags.js'
import { HOMEWORK_BLOCK_WEEKS, homeworkSessionsCount } from './homeworkGoalFormulas.js'
import { generateHomeworkWeek } from './homeworkWeekGenerator.js'
import { buildHomeworkAppSnapshot } from '../homeworkAppSendCore.js'
import { CLUB_OPS_TIMEZONE, todayInTimeZoneIso } from '../../dateRu.js'
import { isUuid, stableUuid } from '../../stableUuid.js'
import { homeworkAutoPlanId } from './homeworkAutoPlanId.js'
import { assertTrainerClientRowPush } from '../../clientRowPushCore.js'
import { screeningAnswered, screeningHomeworkInputs, screeningNeedsClearance } from '../../health/healthScreeningCore.js'

/** Отправка в воскресенье с 10:00 по часам клуба; до 22:00 cron догоняет пропущенное. */
export const HOMEWORK_AUTO_SEND_FROM_MIN = 10 * 60
export const HOMEWORK_AUTO_SEND_TO_MIN = 22 * 60
/** Своё задание тренера за последние дни перед воскресеньем (чт–вс) заменяет автоматическое. */
export const HOMEWORK_AUTO_MANUAL_DAYS = 3

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

/** Одна строка настроек на клиента и одно воскресное задание — без дублей между устройствами и запусками cron. */
export const homeworkStableUuid = stableUuid

export const homeworkAutoRowId = (clientId) => homeworkStableUuid(`homework_auto:${clientId}`)
export { homeworkAutoPlanId } from './homeworkAutoPlanId.js'

function dayMs(iso) {
  return Date.parse(`${iso}T00:00:00Z`)
}

export function addDaysIso(iso, days) {
  return new Date(dayMs(iso) + days * 86_400_000).toISOString().slice(0, 10)
}

export const isSundayIso = (iso) => DAY_RE.test(String(iso ?? '')) && new Date(dayMs(iso)).getUTCDay() === 0

/** Ближайшее воскресенье отправки: сегодня до 10:00 — сегодня, иначе следующее. */
export function nextHomeworkAutoSunday(todayIso, minutesNow) {
  if (isSundayIso(todayIso) && minutesNow < HOMEWORK_AUTO_SEND_FROM_MIN) return todayIso
  const dow = new Date(dayMs(todayIso)).getUTCDay()
  return addDaysIso(todayIso, 7 - dow)
}

/** Ближайшее воскресенье отправки по часам клуба (планшет может стоять в другом поясе). */
export function homeworkAutoUpcomingSunday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: CLUB_OPS_TIMEZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now)
  const get = (t) => Number(parts.find((p) => p.type === t)?.value ?? 0)
  return nextHomeworkAutoSunday(todayInTimeZoneIso(CLUB_OPS_TIMEZONE, now), get('hour') * 60 + get('minute'))
}

/** «18.10» */
export const formatHomeworkAutoDay = (iso) => `${String(iso).slice(8, 10)}.${String(iso).slice(5, 7)}`

/** Воскресенье, когда уйдёт эта неделя блока. activeSunday — отправка недели activeWeek. */
export function homeworkWeekSendIso(activeSundayIso, activeWeek, week) {
  const delta = (Math.round(Number(week) || 1) - Math.round(Number(activeWeek) || 1)) * 7
  return addDaysIso(activeSundayIso, delta)
}

/** Неделя блока для воскресенья: 4 недели, потом новый набор и снова неделя 1. Рассылка не останавливается. */
export function homeworkAutoWeekOf(row, sundayIso) {
  const idx = Math.max(0, Math.floor((dayMs(sundayIso) - dayMs(row.anchor_date)) / (7 * 86_400_000)))
  return {
    block: Math.max(0, Number(row.block_shift) || 0) + Math.floor(idx / HOMEWORK_BLOCK_WEEKS),
    week: (idx % HOMEWORK_BLOCK_WEEKS) + 1,
  }
}

/**
 * Строка очереди / формы → колонки homework_auto.
 * @returns {{ ok: true, data: object } | { ok: false, error: string }}
 */
export function normalizeHomeworkAutoRow(row) {
  if (!isUuid(row?.id) || !isUuid(row?.client_id) || !isUuid(row?.updated_by)) {
    return { ok: false, error: 'Некорректные настройки авто-ДЗ' }
  }
  if (!Object.hasOwn(HOMEWORK_GOALS, row?.goal)) return { ok: false, error: 'Неизвестная цель авто-ДЗ' }
  if (!isSundayIso(row?.anchor_date)) return { ok: false, error: 'Начало блока должно быть воскресеньем' }
  const skip = row?.skip_date == null || row.skip_date === '' ? null : String(row.skip_date)
  if (skip !== null && !isSundayIso(skip)) return { ok: false, error: 'Пропустить можно только воскресенье' }
  const avoid = [...new Set((Array.isArray(row?.avoid) ? row.avoid : []).filter((a) => Object.hasOwn(HOMEWORK_AVOID, a)))]
  const updatedMs = Date.parse(String(row?.updated_at ?? ''))
  return {
    ok: true,
    data: {
      id: String(row.id),
      client_id: String(row.client_id),
      club_id: isUuid(row?.club_id) ? String(row.club_id) : null,
      enabled: row?.enabled === true,
      goal: row.goal,
      level: Math.min(3, Math.max(1, Math.round(Number(row?.level) || 1))),
      avoid,
      sessions: homeworkSessionsCount(row?.sessions),
      sex: row?.sex === 'female' || row?.sex === 'male' ? row.sex : null,
      limits_ok: row?.limits_ok === true,
      anchor_date: String(row.anchor_date),
      block_shift: Math.min(999, Math.max(0, Math.round(Number(row?.block_shift) || 0))),
      skip_date: skip,
      updated_by: String(row.updated_by),
      updated_at: Number.isFinite(updatedMs) ? new Date(updatedMs).toISOString() : new Date().toISOString(),
    },
  }
}

/**
 * Кто меняет настройки: тренер клиента или главный админ; id строки — постоянный от клиента.
 * @param {{ op: string, isAdmin?: boolean, isTrainer?: boolean, userId: string, payload: object, remoteId?: string|null, client: object|null }} p
 */
export function assertHomeworkAutoPush(p) {
  return assertTrainerClientRowPush({
    ...p,
    rowId: homeworkAutoRowId,
    what: { noDelete: 'Авто-ДЗ не удаляется — выключите его', who: 'Авто-ДЗ настраивает тренер клиента', bad: 'Некорректные настройки авто-ДЗ' },
  })
}

function filled(v) {
  if (Array.isArray(v)) return v.some((x) => String(x ?? '').trim())
  return Boolean(String(v ?? '').trim())
}

/** В карточке здоровья есть болезни или противопоказания. */
export function healthHasLimits(health) {
  return filled(health?.diseases) || filled(health?.contraindications)
}

/** «Грыжа L5 · гипертония» — что именно в карточке, чтобы тренер решил, не уходя с экрана. */
export function healthLimitsText(health, max = 120) {
  const parts = [health?.contraindications, health?.diseases]
    .flatMap((v) => (Array.isArray(v) ? v : [v]))
    .map((v) => String(v ?? '').trim())
    .filter(Boolean)
  const text = parts.join(' · ')
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

/** Воскресенье, с которого блок снова пойдёт с недели 1 (тот же набор, если тренер его не сменил). */
export function homeworkAutoNextBlockSunday(row, sundayIso) {
  const { week } = homeworkAutoWeekOf(row, sundayIso)
  return addDaysIso(sundayIso, (HOMEWORK_BLOCK_WEEKS - week + 1) * 7)
}

/**
 * Почему в это воскресенье задание не уйдёт (null — уйдёт).
 * clearance — в анкете здоровья есть «да» в допуске / болит сейчас, тренер ещё не подтвердил допуск.
 * limits — анкеты нет, а в карточке есть противопоказания текстом: тренер не отметил ограничения и не подтвердил «ограничений нет».
 * manual — тренер сам отправил задание за последние дни.
 * screening — answers из health_screenings (null — анкеты нет).
 */
export function homeworkAutoHoldReason({ row, client, health, screening = null, sundayIso, lastManualDay = null }) {
  if (!row?.enabled) return 'off'
  if (!client || client.archived_at) return 'archived'
  if (sundayIso < row.anchor_date) return 'not_started'
  if (row.skip_date === sundayIso) return 'skip'
  if (screeningAnswered(screening)) {
    if (screeningNeedsClearance(screening)) return 'clearance'
  } else if (!row.avoid?.length && !row.limits_ok && healthHasLimits(health)) return 'limits'
  if (lastManualDay && lastManualDay >= addDaysIso(sundayIso, -HOMEWORK_AUTO_MANUAL_DAYS)) return 'manual'
  return null
}

export const HOMEWORK_AUTO_HOLD_RU = {
  off: 'Автоотправка выключена',
  archived: 'Клиент в архиве',
  not_started: 'Первая отправка — в следующее воскресенье',
  skip: 'Это воскресенье пропускаем',
  limits: 'В карточке есть противопоказания — отметьте «Нельзя при» или подтвердите, что ограничений нет',
  clearance: 'В анкете здоровья есть ограничения — подтвердите допуск',
  manual: 'Вы уже отправили задание на этой неделе — автоматическое не уйдёт',
}

/** Неделя для воскресенья: черновик (предпросмотр тренеру) + номер недели и блока. */
export function buildHomeworkAutoWeek(row, sundayIso, screening = null, library = undefined) {
  const { block, week } = homeworkAutoWeekOf(row, sundayIso)
  const res = generateHomeworkWeek({
    library,
    goal: row.goal,
    ...screeningHomeworkInputs(row, screening),
    sex: row.sex,
    sessions: row.sessions,
    week,
    seed: row.client_id,
    variant: block,
  })
  return res.ok ? { ok: true, draft: res.draft, week, block } : { ok: false, error: res.error }
}

/**
 * Строка client_plans для воскресенья. sent_by — тренер клиента: push «Тренер Анна: новое задание».
 * @returns {{ ok: true, plan: object } | { ok: false, error: string }}
 */
export function buildHomeworkAutoPlan({ row, client, screening = null, sundayIso, now = new Date(), library = undefined }) {
  const sentBy = isUuid(client?.trainer_id) ? String(client.trainer_id) : String(row.updated_by)
  const week = buildHomeworkAutoWeek(row, sundayIso, screening, library)
  if (!week.ok) return week
  const snap = buildHomeworkAppSnapshot(week.draft)
  if (!snap.ok) return { ok: false, error: 'no_exercises' }
  return {
    ok: true,
    plan: {
      id: homeworkAutoPlanId(row.client_id, sundayIso),
      client_id: String(row.client_id),
      club_id: isUuid(client?.club_id) ? String(client.club_id) : null,
      kind: 'homework',
      payload: snap.payload,
      sent_by: sentBy,
      sent_at: now.toISOString(),
    },
  }
}
