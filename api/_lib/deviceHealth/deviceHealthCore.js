/**
 * Центр сбоев устройств — чистые правила сервера (проверка: scripts/verify-device-health.mjs).
 * Строка device_health = одно устройство тренера; активные коды = с планшета + найденные сервером.
 */
import {
  DEVICE_CLIENT_CODES,
  DEVICE_HEALTH_CODES,
  deviceHealthInstruction,
  normalizeDeviceHealthCodes,
} from '../../../src/lib/deviceHealth/deviceHealthCatalog.js'
import { sanitizeDeviceQueueLines } from '../../../src/lib/deviceHealth/deviceHealthQueueCore.js'

/** Устройство «на связи»: планшет шлёт отчёт раз в 30 минут, пока приложение на экране. */
export const DEVICE_ALIVE_MS = 45 * 60_000
export const SERVER_NO_PULL_MS = 2 * 60 * 60_000
export const PUSH_REPEAT_MS = 2 * 60 * 60_000
/** Без отчётов сутки — планшет выключен или приложение удалено: проблемы снимаем, строка остаётся в «Все устройства». */
export const DEVICE_SILENT_CLEAR_MS = 24 * 60 * 60_000
/** Тот же отчёт чаще — не пишем в базу (защита от зацикленного клиента). */
export const REPORT_MIN_INTERVAL_MS = 60_000
const OPS_FROM_MIN = 7 * 60
const OPS_TO_MIN = 23 * 60
const REMIND_FROM_MIN = 8 * 60
const REMIND_TO_MIN = 22 * 60

const BUNDLE_RE = /^[A-Za-z0-9_-]{1,40}$/

function ms(v) {
  const t = v ? Date.parse(v) : NaN
  return Number.isFinite(t) ? t : null
}

function sameCodes(a, b) {
  return normalizeDeviceHealthCodes(a).join(',') === normalizeDeviceHealthCodes(b).join(',')
}

function queueSig(lines) {
  return (Array.isArray(lines) ? lines : [])
    .map((l) => [l?.table, l?.op, l?.retries, l?.error, l?.who].join('\u001f'))
    .join('\n')
}

/** Тело отчёта планшета → только разрешённое; номер устройства — из заголовка, не из тела. */
export function sanitizeDeviceReport(body) {
  const b = body && typeof body === 'object' ? body : {}
  const bundle = String(b.bundle_id ?? '').trim()
  const queue = Math.trunc(Number(b.queue_count))
  return {
    problems: normalizeDeviceHealthCodes(b.problems, DEVICE_CLIENT_CODES),
    bundle_id: BUNDLE_RE.test(bundle) ? bundle : null,
    queue_count: Number.isFinite(queue) ? Math.min(Math.max(queue, 0), 100_000) : 0,
    queue_lines: sanitizeDeviceQueueLines(
      Object.prototype.hasOwnProperty.call(b, 'queue_lines') ? b.queue_lines : undefined,
    ),
  }
}

export function activeDeviceCodes(row) {
  return normalizeDeviceHealthCodes([...(row?.problems ?? []), ...(row?.server_problems ?? [])])
}

/** «Решено» админом действует, пока набор проблем не расширился. */
export function isDeviceAcknowledged(row) {
  if (!row?.resolved_at) return false
  const acked = new Set(normalizeDeviceHealthCodes(row.resolved_codes))
  return activeDeviceCodes(row).every((c) => acked.has(c))
}

export function deviceNeedsAttention(row) {
  return activeDeviceCodes(row).length > 0 && !isDeviceAcknowledged(row)
}

/** Переходы «появилась проблема / всё прошло» для уже собранной строки. */
function withTransitions(prev, next, nowIso) {
  const before = activeDeviceCodes(prev)
  const after = activeDeviceCodes(next)
  if (!after.length) {
    return { ...next, problem_since: null, notified_codes: [], resolved_at: null, resolved_codes: [], resolved_by: null }
  }
  return { ...next, problem_since: before.length && prev?.problem_since ? prev.problem_since : nowIso }
}

/**
 * Отчёт планшета → строка для upsert, или null, если тот же отчёт пришёл меньше минуты назад.
 * Планшет больше не видит сбоя загрузки — снимаем и серверный server_no_pull.
 */
export function applyDeviceReport(prev, report, { userId, deviceId, clubId, label, now = Date.now() }) {
  const nowIso = new Date(now).toISOString()
  const lastAt = ms(prev?.last_report_at)
  if (
    prev &&
    lastAt != null &&
    now - lastAt < REPORT_MIN_INTERVAL_MS &&
    sameCodes(prev.problems, report.problems) &&
    prev.bundle_id === report.bundle_id &&
    (report.queue_lines == null || queueSig(prev.queue_lines) === queueSig(report.queue_lines))
  ) {
    return null
  }
  const keepServer = report.problems.includes('pull_failing') ? normalizeDeviceHealthCodes(prev?.server_problems) : []
  const next = {
    ...(prev ?? {}),
    user_id: userId,
    device_id: deviceId,
    club_id: clubId ?? prev?.club_id ?? null,
    label: label ?? prev?.label ?? null,
    bundle_id: report.bundle_id,
    queue_count: report.queue_count,
    queue_lines: report.queue_lines == null ? (prev?.queue_lines ?? []) : report.queue_lines,
    problems: report.problems,
    server_problems: keepServer,
    last_report_at: nowIso,
  }
  // Эти поля пишут trainer-pull и cron; отчёт не должен затирать их старым значением.
  for (const k of ['id', 'created_at', 'last_pull_ok_at', 'notified_at']) delete next[k]
  return withTransitions(prev, next, nowIso)
}

const STATE_FIELDS = ['problems', 'server_problems', 'problem_since', 'notified_codes', 'resolved_at', 'resolved_codes', 'resolved_by']

function statePatch(row) {
  return Object.fromEntries(STATE_FIELDS.filter((k) => k in row).map((k) => [k, row[k]]))
}

/**
 * server_no_pull: планшет на связи и сам видит сбой загрузки, а сервер не видел успешного trainer-pull 2 часа.
 * Только в часы работы клуба (7:00–23:00 МСК), ночью планшеты не в работе.
 */
export function detectServerNoPull(row, now, opsMinutes) {
  if (opsMinutes < OPS_FROM_MIN || opsMinutes >= OPS_TO_MIN) return false
  const reportAt = ms(row?.last_report_at)
  if (reportAt == null || now - reportAt > DEVICE_ALIVE_MS) return false
  if (!normalizeDeviceHealthCodes(row?.problems).includes('pull_failing')) return false
  const okAt = ms(row?.last_pull_ok_at) ?? ms(row?.created_at)
  return okAt != null && now - okAt > SERVER_NO_PULL_MS
}

/**
 * Что cron меняет в строке: server_no_pull и снятие проблем у замолчавшего устройства.
 * Только поля состояния (patch для update); null — менять нечего.
 */
export function planDeviceServerUpdate(row, now, opsMinutes) {
  const nowIso = new Date(now).toISOString()
  const reportAt = ms(row?.last_report_at)
  if (activeDeviceCodes(row).length && reportAt != null && now - reportAt > DEVICE_SILENT_CLEAR_MS) {
    return statePatch(withTransitions(row, { ...row, problems: [], server_problems: [] }, nowIso))
  }
  const server = detectServerNoPull(row, now, opsMinutes) ? ['server_no_pull'] : []
  if (sameCodes(server, row?.server_problems)) return null
  return statePatch(withTransitions(row, { ...row, server_problems: server }, nowIso))
}

/**
 * Push админам только по критичным кодам: сразу при новом коде, повтор не чаще раза в 2 часа
 * и только днём (8:00–22:00), пока устройство на связи. После «Решено» — молчим.
 * @returns {{ codes: string[], reminder: boolean } | null}
 */
export function planDevicePush(row, now, opsMinutes) {
  if (isDeviceAcknowledged(row)) return null
  const codes = activeDeviceCodes(row).filter((c) => DEVICE_HEALTH_CODES[c].critical)
  if (!codes.length) return null
  const notified = new Set(normalizeDeviceHealthCodes(row?.notified_codes))
  if (codes.some((c) => !notified.has(c))) return { codes, reminder: false }
  const notifiedAt = ms(row?.notified_at)
  const reportAt = ms(row?.last_report_at)
  const daytime = opsMinutes >= REMIND_FROM_MIN && opsMinutes < REMIND_TO_MIN
  const alive = reportAt != null && now - reportAt <= DEVICE_ALIVE_MS
  if (daytime && alive && notifiedAt != null && now - notifiedAt >= PUSH_REPEAT_MS) return { codes, reminder: true }
  return null
}

export function buildDevicePushPayload(row, trainerName, plan) {
  const name = String(trainerName ?? '').trim() || 'Тренер'
  const titles = plan.codes.map((c) => DEVICE_HEALTH_CODES[c].title).join('; ')
  const line = Array.isArray(row.queue_lines) ? String(row.queue_lines[0]?.text ?? '').trim() : ''
  const why = line ? ` ${line}.` : ''
  return {
    title: plan.reminder ? `Всё ещё сбой планшета: ${name}` : `Сбой планшета: ${name}`,
    body: `${titles}.${why} Скажите тренеру: ${DEVICE_HEALTH_CODES[plan.codes[0]].tellTrainer}`,
    url: '/admin/health',
    tag: `device-health-${row.id}`,
  }
}

/** Строка для админа: без служебных полей, с готовой инструкцией. */
export function toDeviceHealthView(row, { trainerName, clubName } = {}) {
  const codes = activeDeviceCodes(row)
  return {
    id: row.id,
    user_id: row.user_id,
    trainer_name: trainerName ?? null,
    club_name: clubName ?? null,
    device_id: row.device_id,
    label: row.label ?? null,
    bundle_id: row.bundle_id ?? null,
    queue_count: Number(row.queue_count ?? 0),
    queue_lines: (Array.isArray(row.queue_lines) ? row.queue_lines : [])
      .map((l) => ({ text: String(l?.text ?? '').trim() }))
      .filter((l) => l.text)
      .slice(0, 5),
    last_report_at: row.last_report_at ?? null,
    last_pull_ok_at: row.last_pull_ok_at ?? null,
    problem_since: row.problem_since ?? null,
    codes,
    critical: codes.some((c) => DEVICE_HEALTH_CODES[c].critical),
    needs_attention: deviceNeedsAttention(row),
    acknowledged: isDeviceAcknowledged(row),
    instruction: deviceHealthInstruction(codes),
  }
}
