/**
 * Рассылка во «Входящие» клиентов или сотрудников клуба: объявление или опрос. Проверка черновика до записи — одна для сервера и формы.
 * Канон: docs/INBOX.md. Без React / IDB.
 */
import { normalizeMembershipHall } from '../membershipHallCore.js'
import { normalizeInboxTrigger } from './inboxTriggerCore.js'

export const INBOX_KINDS = /** @type {const} */ (['notice', 'survey'])
export const INBOX_QUESTION_TYPES = /** @type {const} */ (['rating', 'single', 'multi', 'text'])
export const INBOX_AUDIENCES = /** @type {const} */ (['clients', 'staff'])
/** Ключи ролей получателей-сотрудников (не значения users.role — их сводит inboxStaffRoleOf). */
export const INBOX_STAFF_ROLES = /** @type {const} */ (['trainer', 'sales', 'supervisor'])

export const INBOX_LIMITS = Object.freeze({
  title: 120,
  body: 2000,
  questions: 20,
  questionText: 300,
  options: 10,
  optionText: 120,
  rewardMax: 10000,
  expiresDaysDefault: 14,
  expiresDaysMax: 60,
  clubsMax: 50,
})

export const INBOX_QUESTION_TYPE_LABELS = Object.freeze({
  rating: 'Оценка 1–5',
  single: 'Один вариант',
  multi: 'Несколько вариантов',
  text: 'Свой ответ',
})

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isInboxUuid(raw) {
  return UUID_RE.test(String(raw ?? '').trim())
}

function cleanText(raw, max) {
  return String(raw ?? '')
    .replace(/\r\n/g, '\n')
    .trim()
    .slice(0, max)
}

/** @returns {Array<'pz'|'tz'|'az'>} пусто = все залы */
export function normalizeInboxHalls(raw) {
  const list = Array.isArray(raw) ? raw : []
  return [...new Set(list.map((h) => normalizeMembershipHall(h)).filter(Boolean))]
}

export function normalizeInboxStaffRoles(raw) {
  const list = Array.isArray(raw) ? raw : []
  return INBOX_STAFF_ROLES.filter((r) => list.includes(r))
}

export function normalizeInboxClubIds(raw) {
  const list = Array.isArray(raw) ? raw : []
  return [...new Set(list.map((id) => String(id ?? '').trim()).filter(isInboxUuid))]
}

/** Вопрос → канон; id выдаём по порядку (q1, q2…), ответы ссылаются на них. */
function normalizeQuestion(raw, index) {
  const type = INBOX_QUESTION_TYPES.includes(raw?.type) ? raw.type : null
  const text = cleanText(raw?.text, INBOX_LIMITS.questionText)
  const q = { id: `q${index + 1}`, type, text, required: raw?.required !== false }
  if (type === 'single' || type === 'multi') {
    const opts = (Array.isArray(raw?.options) ? raw.options : [])
      .map((o) => cleanText(o, INBOX_LIMITS.optionText))
      .filter(Boolean)
    q.options = [...new Set(opts)].slice(0, INBOX_LIMITS.options)
  }
  return q
}

function questionError(q) {
  const n = Number(q.id.slice(1))
  if (!q.type) return `Вопрос ${n}: выберите тип`
  if (!q.text) return `Вопрос ${n}: впишите текст`
  if ((q.type === 'single' || q.type === 'multi') && q.options.length < 2) return `Вопрос ${n}: нужно минимум 2 варианта`
  return null
}

/**
 * Черновик из формы → то, что пишем в inbox_campaigns.
 * @returns {{ ok: true, campaign: object } | { ok: false, error: string }}
 */
export function normalizeInboxCampaignDraft(raw) {
  const kind = INBOX_KINDS.includes(raw?.kind) ? raw.kind : null
  if (!kind) return { ok: false, error: 'Выберите: объявление или опрос' }
  const audience = raw?.audience == null ? 'clients' : INBOX_AUDIENCES.includes(raw.audience) ? raw.audience : null
  if (!audience) return { ok: false, error: 'Выберите, кому: клиентам или сотрудникам' }
  const staff = audience === 'staff'
  const staff_roles = staff ? normalizeInboxStaffRoles(raw?.staff_roles) : []
  if (staff && !staff_roles.length) return { ok: false, error: 'Отметьте, кому из сотрудников отправить' }
  const title = cleanText(raw?.title, INBOX_LIMITS.title)
  if (!title) return { ok: false, error: 'Впишите заголовок' }
  const body = cleanText(raw?.body, INBOX_LIMITS.body)
  if (kind === 'notice' && !body) return { ok: false, error: 'Впишите текст объявления' }

  let questions = []
  let reward_points = 0
  if (kind === 'survey') {
    const src = Array.isArray(raw?.questions) ? raw.questions : []
    if (!src.length) return { ok: false, error: 'Добавьте хотя бы один вопрос' }
    if (src.length > INBOX_LIMITS.questions) return { ok: false, error: `Не больше ${INBOX_LIMITS.questions} вопросов` }
    questions = src.map(normalizeQuestion)
    const bad = questions.map(questionError).find(Boolean)
    if (bad) return { ok: false, error: bad }
    const pts = Math.trunc(Number(raw?.reward_points) || 0)
    if (pts < 0 || pts > INBOX_LIMITS.rewardMax) return { ok: false, error: `Баллы — от 0 до ${INBOX_LIMITS.rewardMax}` }
    reward_points = staff ? 0 : pts
  }

  const club_ids = normalizeInboxClubIds(raw?.club_ids)
  if (!club_ids.length) return { ok: false, error: 'Выберите клуб' }
  if (club_ids.length > INBOX_LIMITS.clubsMax) return { ok: false, error: 'Слишком много клубов в одной рассылке' }

  const trigger = raw?.trigger ? normalizeInboxTrigger(raw.trigger) : null
  if (raw?.trigger && (!trigger || kind !== 'survey' || staff)) {
    return { ok: false, error: 'Автоотправка — только для опроса клиентам' }
  }

  const daysRaw = Math.trunc(Number(raw?.expires_in_days) || INBOX_LIMITS.expiresDaysDefault)
  const expires_in_days = Math.min(Math.max(daysRaw, 1), INBOX_LIMITS.expiresDaysMax)

  return {
    ok: true,
    campaign: {
      kind,
      audience,
      staff_roles,
      title,
      body,
      questions,
      reward_points,
      club_ids,
      halls: staff || trigger ? [] : normalizeInboxHalls(raw?.halls),
      expires_in_days,
      trigger,
    },
  }
}

/** Срок рассылки: created + N дней. */
export function inboxExpiresAtIso(nowIso, days) {
  const base = Date.parse(nowIso)
  const n = Math.min(Math.max(Math.trunc(Number(days) || INBOX_LIMITS.expiresDaysDefault), 1), INBOX_LIMITS.expiresDaysMax)
  return new Date((Number.isFinite(base) ? base : Date.now()) + n * 86400000).toISOString()
}

/** Опрос ещё принимает ответы: не закрыт вручную и срок не вышел. Автоопрос работает, пока не закроют. */
export function isInboxCampaignOpen(campaign, nowIso = new Date().toISOString()) {
  if (!campaign || campaign.closed_at) return false
  if (normalizeInboxTrigger(campaign.trigger)) return true
  const exp = Date.parse(campaign.expires_at)
  const now = Date.parse(nowIso)
  return Number.isFinite(exp) && Number.isFinite(now) && now < exp
}
