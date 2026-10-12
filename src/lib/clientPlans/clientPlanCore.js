/**
 * Снимок задания от тренера / рациона, отправленный клиенту в приложение (таблица client_plans).
 * Один белый список для планшета (отправка), сервера (push-record, /api/client-me) и verify:
 * в снимок не попадают заметки тренера, опросник здоровья, вес и id сотрудников.
 */

export const CLIENT_PLAN_KINDS = Object.freeze(['homework', 'nutrition'])
/** Рацион на 6 приёмов с 30 продуктами — около 15 КБ; запас на рост, но не «что угодно». */
export const CLIENT_PLAN_MAX_BYTES = 48_000

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isClientPlanId(v) {
  return UUID_RE.test(String(v ?? '').trim())
}

export function isClientPlanKind(kind) {
  return CLIENT_PLAN_KINDS.includes(String(kind ?? ''))
}

function str(v, max) {
  return String(v ?? '').trim().slice(0, max)
}

function num(v, min, max) {
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  return Math.min(max, Math.max(min, Math.round(n * 10) / 10))
}

function list(v, max) {
  return Array.isArray(v) ? v.slice(0, max) : []
}

function macros(o) {
  return {
    kcal: Math.round(num(o?.kcal, 0, 20_000) ?? 0),
    proteinG: num(o?.proteinG, 0, 2000) ?? 0,
    fatG: num(o?.fatG, 0, 2000) ?? 0,
    carbsG: num(o?.carbsG, 0, 2000) ?? 0,
  }
}

function sanitizeHomework(p) {
  const blocks = list(p?.blocks, 12)
    .map((b) => ({
      label: str(b?.label, 60) || 'Основное',
      exercises: list(b?.exercises, 40)
        .map((ex) => ({
          name: str(ex?.name, 120),
          sets: Math.round(num(ex?.sets, 1, 20) ?? 1),
          reps: str(ex?.reps, 20),
          rest_sec: Math.round(num(ex?.rest_sec, 0, 600) ?? 0),
        }))
        .filter((ex) => ex.name),
    }))
    .filter((b) => b.exercises.length)
  if (!blocks.length) return null
  return { title: str(p?.title, 120) || 'Задание от тренера', comment: str(p?.comment, 500), blocks }
}

function sanitizeNutrition(p) {
  const meals = list(p?.meals, 10)
    .map((m) => ({
      label: str(m?.label, 60),
      items: list(m?.items, 30)
        .map((it) => ({ label: str(it?.label, 120), portion: str(it?.portion, 60), grams: num(it?.grams, 0, 5000), ...macros(it) }))
        .filter((it) => it.label),
      subtotal: macros(m?.subtotal),
    }))
    .filter((m) => m.label && m.items.length)
  if (!meals.length) return null
  return {
    goal: str(p?.goal, 80),
    kcal_target: num(p?.kcal_target, 0, 20_000),
    totals: macros(p?.totals),
    meals,
    disclaimer: str(p?.disclaimer, 400),
  }
}

/** @returns {object|null} null — пустой или битый снимок */
export function sanitizeClientPlanPayload(kind, payload) {
  if (kind === 'homework') return sanitizeHomework(payload)
  if (kind === 'nutrition') return sanitizeNutrition(payload)
  return null
}

/** Цифры для плитки: «6 упражнений» / «1850 ккал · Б/Ж/У». */
export function summarizeClientPlan(kind, payload) {
  if (kind === 'homework') {
    const count = list(payload?.blocks, 12).reduce((n, b) => n + list(b?.exercises, 40).length, 0)
    return { title: str(payload?.title, 120), count }
  }
  if (kind === 'nutrition') {
    const t = macros(payload?.totals)
    return { kcal: t.kcal, proteinG: t.proteinG, fatG: t.fatG, carbsG: t.carbsG }
  }
  return {}
}

/**
 * Строка очереди → колонки таблицы. client_seen_at / notified_at с планшета не принимаем — их ставит сервер.
 * @returns {{ ok: true, data: object } | { ok: false, error: string }}
 */
export function normalizeClientPlanPushPayload(row) {
  const kind = String(row?.kind ?? '')
  if (!isClientPlanKind(kind)) return { ok: false, error: 'Неизвестный вид задания' }
  if (!isClientPlanId(row?.id) || !isClientPlanId(row?.client_id) || !isClientPlanId(row?.sent_by)) {
    return { ok: false, error: 'Некорректное задание для клиента' }
  }
  const payload = sanitizeClientPlanPayload(kind, row?.payload)
  if (!payload) return { ok: false, error: kind === 'homework' ? 'В задании нет упражнений' : 'В рационе нет приёмов пищи' }
  if (JSON.stringify(payload).length > CLIENT_PLAN_MAX_BYTES) return { ok: false, error: 'Задание слишком большое' }
  const sentMs = Date.parse(String(row?.sent_at ?? ''))
  return {
    ok: true,
    data: {
      id: String(row.id),
      client_id: String(row.client_id),
      club_id: isClientPlanId(row?.club_id) ? String(row.club_id) : null,
      kind,
      payload,
      summary: summarizeClientPlan(kind, payload),
      sent_by: String(row.sent_by),
      sent_at: Number.isFinite(sentMs) ? new Date(sentMs).toISOString() : new Date().toISOString(),
    },
  }
}

/**
 * Кто может отправить в приложение клиента: тренер этого клиента или главный админ.
 * Только новая запись — отправленное не правим, тренер шлёт новое.
 * @param {{ op: string, isAdmin?: boolean, isTrainer?: boolean, userId: string, payload: object, client: object|null }} p
 */
export function assertClientPlanPush({ op, isAdmin = false, isTrainer = false, userId, payload, client }) {
  if (op !== 'insert') return { ok: false, error: 'Отправленное задание не меняется — отправьте новое' }
  if (!isAdmin && !isTrainer) {
    return { ok: false, error: 'Отправить в приложение клиента может его тренер или главный администратор' }
  }
  if (String(payload?.sent_by ?? '') !== String(userId ?? '')) return { ok: false, error: 'Задание должно быть от вашего имени' }
  if (!client) return { ok: false, error: 'Клиент не найден' }
  if (client.archived_at) return { ok: false, error: 'Клиент в архиве — приложение ему недоступно' }
  if (!isAdmin && String(client.trainer_id ?? '') !== String(userId)) return { ok: false, error: 'Нет доступа к клиенту' }
  const clientClub = String(client.club_id ?? '')
  if (clientClub && String(payload?.club_id ?? '') !== clientClub) {
    return { ok: false, error: 'Клуб задания не совпадает с клубом клиента' }
  }
  return { ok: true }
}

/** «10.10, 18:40» в часовом поясе устройства (или заданном). */
export function formatPlanMomentRu(iso, timeZone) {
  const d = new Date(String(iso ?? ''))
  if (Number.isNaN(d.getTime())) return ''
  const parts = new Intl.DateTimeFormat('ru-RU', {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d)
  const get = (t) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('day')}.${get('month')}, ${get('hour')}:${get('minute')}`
}

/** Подпись под кнопкой у тренера по последней отправке этого вида. */
export function clientPlanMarkText(mark, timeZone) {
  if (!mark?.sent_at) return ''
  if (mark.client_seen_at) return `Клиент открыл ${formatPlanMomentRu(mark.client_seen_at, timeZone)}`
  const sent = `Отправлено ${formatPlanMomentRu(mark.sent_at, timeZone)}`
  return mark.synced === false ? `${sent} · уйдёт, когда появится связь` : sent
}
