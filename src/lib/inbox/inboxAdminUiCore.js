/**
 * Подписи экрана «Рассылки» (админ / управляющий) и шаблоны черновика. Без React.
 */
import { INBOX_LIMITS } from './inboxCampaignCore.js'
import { INBOX_TRIGGERS } from './inboxTriggerCore.js'

export const INBOX_HALL_LABELS = Object.freeze({ pz: 'ПЗ', tz: 'ТЗ', az: 'АЗ' })
export const INBOX_STAFF_ROLE_LABELS = Object.freeze({ trainer: 'Тренеры', sales: 'Менеджеры продаж', supervisor: 'Управляющие' })

/** Роли, которые можно выбрать: управляющий не пишет управляющим (в клубе он один — это он сам). */
export function inboxStaffRoleChoices(isSupervisor) {
  return Object.keys(INBOX_STAFF_ROLE_LABELS).filter((r) => !(isSupervisor && r === 'supervisor'))
}
export const INBOX_EXPIRES_CHOICES = Object.freeze([3, 7, 14, 30])

export function emptyInboxQuestion(type = 'rating') {
  return { type, text: '', options: [], required: true }
}

/** Варианты в форме — textarea, по одному на строку. */
export function inboxOptionsFromText(text) {
  return String(text ?? '').split('\n')
}

export function emptyInboxDraft(kind = 'survey', clubIds = []) {
  return {
    kind,
    audience: 'clients',
    staff_roles: ['trainer'],
    title: '',
    body: '',
    questions: kind === 'survey' ? [emptyInboxQuestion('rating')] : [],
    reward_points: 0,
    club_ids: clubIds,
    halls: [],
    expires_in_days: INBOX_LIMITS.expiresDaysDefault,
    trigger: null,
  }
}

/** «Когда»: сразу или автоопрос по рубежу. */
export const INBOX_WHEN_CHOICES = Object.freeze([
  { trigger: null, label: 'Сейчас' },
  { trigger: 'trainings_10', label: 'После 10-й тренировки' },
])

export function inboxTriggerReachRu(trigger) {
  const t = INBOX_TRIGGERS[trigger]
  return t ? `Придёт каждому клиенту с приложением ${t.label} — пока опрос не закроете` : ''
}

/** Смена типа вопроса: текст и варианты остаются (вернётся к «вариантам» — не набирать заново). */
export function changeInboxQuestionType(q, type) {
  return { ...q, type }
}

export function inboxQuestionHasOptions(q) {
  return q?.type === 'single' || q?.type === 'multi'
}

export function inboxHallsLabelRu(halls) {
  const list = (halls ?? []).map((h) => INBOX_HALL_LABELS[h]).filter(Boolean)
  return list.length ? list.join(', ') : 'Все залы'
}

/** Кому ушла рассылка: «Клиенты · ПЗ» / «Сотрудники · тренеры, менеджеры продаж». */
export function inboxRecipientsLabelRu(campaign) {
  const trigger = INBOX_TRIGGERS[campaign?.trigger]
  if (trigger) return `Клиенты · ${trigger.label}`
  if (campaign?.audience !== 'staff') return `Клиенты · ${inboxHallsLabelRu(campaign?.halls)}`
  const roles = (campaign.staff_roles ?? []).map((r) => INBOX_STAFF_ROLE_LABELS[r]?.toLowerCase()).filter(Boolean)
  return roles.length ? `Сотрудники · ${roles.join(', ')}` : 'Сотрудники'
}

function pct(part, whole) {
  return whole > 0 ? Math.round((part / whole) * 100) : 0
}

/** «37 получили · 20 прочитали · 12 ответили (32%)» */
export function inboxStatsLineRu(kind, stats) {
  const s = stats ?? { recipients: 0, read: 0, answered: 0 }
  const head = `${s.recipients} получили · ${s.read} прочитали`
  return kind === 'survey' ? `${head} · ${s.answered} ответили (${pct(s.answered, s.recipients)}%)` : head
}

/** Охват перед отправкой. */
export function inboxAudienceLineRu(audience, kind = 'clients') {
  if (!audience) return ''
  const { matched = 0, recipients = 0 } = audience
  if (kind === 'staff') return recipients ? `Получат сотрудников: ${recipients}` : 'В выбранных клубах нет таких сотрудников'
  if (!matched) return 'Под фильтр не попал ни один клиент'
  if (!recipients) return `Клиентов под фильтром: ${matched}, но ни у кого нет приложения — отправлять некому`
  if (recipients === matched) return `Дойдёт до всех: ${recipients}`
  return `Дойдёт до ${recipients} из ${matched} — у остальных нет приложения`
}

export function inboxPushNoteRu(push) {
  if (push === 'quiet') return 'Сейчас тихие часы (22:00–9:00): уведомление на телефон не отправим, сообщение уже во «Входящих».'
  if (push === 'off') return 'Push на сервере не настроен: получатели увидят сообщение, когда откроют приложение.'
  return ''
}

export function inboxStatusLabelRu(campaign) {
  if (campaign?.kind !== 'survey') return 'Объявление'
  const head = INBOX_TRIGGERS[campaign.trigger] ? 'Автоопрос' : 'Опрос'
  return campaign.open ? `${head} · идёт` : `${head} · закрыт`
}

/** Ширина полоски в итогах, % от максимума (0…100). */
export function inboxBarPct(count, total) {
  return total > 0 ? Math.round((count / total) * 100) : 0
}
