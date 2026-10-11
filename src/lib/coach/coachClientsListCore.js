/**
 * Список «Клиенты» на телефоне тренера: те же фильтры, порядок и подписи абонемента, что на планшете.
 * Без React / IDB — проверяется verify-coach-clients.mjs.
 */
import { membershipSignal, pickExpiredMembershipWithRemaining } from '../clientListSignals.js'
import {
  daysUntilNextBirthday,
  formatUpcomingBirthdayLabel,
  partitionBirthdayBrowseClients,
  sortClientsForBirthdayBrowse,
  withBirthdayBrowseSectionBreaks,
} from '../clientBirthdays.js'
import { formatDateRu } from '../dateRu.js'
import { membershipUsageLabel, pickUsableMembershipForDate } from '../membershipRules.js'
import { isOutreachScenario } from '../trainer/trainerClientOutreachCore.js'
import { buildTrainerClientsBrowseCounts, filterTrainerClientsByBrowseMode } from '../trainer/trainerClientsBrowseFilterCore.js'
import { sortClientsForOutreachFilter } from '../trainer/trainerOutreachQueue.js'

const NO_SENT = new Set()
/** ДР в строке — только близко (неделя), чтобы строка не пестрела; в фильтре «ДР» — всегда. */
export const COACH_BIRTHDAY_ROW_DAYS = 7

/** «12.10.2026 (завтра)» или null. */
export function coachBirthdayLabel(birthDate, today, filter) {
  const days = daysUntilNextBirthday(birthDate, today)
  if (days == null || (filter !== 'birthdays' && days > COACH_BIRTHDAY_ROW_DAYS)) return null
  return formatUpcomingBirthdayLabel(birthDate, today)
}

/** tel: для «Позвонить»: только цифры и ведущий +; без номера — null. */
export function coachTelHref(phone) {
  const raw = String(phone ?? '').trim()
  const digits = raw.replace(/\D/g, '')
  if (digits.length < 5) return null
  return `tel:${raw.startsWith('+') ? '+' : ''}${digits}`
}

function matchesQuery(client, q) {
  if (!q) return true
  return [client.name, client.phone, client.card_number].some((v) => String(v ?? '').toLowerCase().includes(q))
}

/**
 * @param {{ clients: object[], memByClient: Record<string, object[]>, today: string, filter: string, query: string }} input
 * @returns {{ counts: Record<string, number>, total: number,
 *   items: Array<{ type: 'section', key: string, title: string, count?: number } | { type: 'client', client: object }> }}
 */
export function buildCoachClientsView({ clients, memByClient, today, filter, query }) {
  const extra = { lastTrainingByClient: Object.fromEntries((clients ?? []).map((c) => [c.id, c.last_training_date ?? null])) }
  const counts = buildTrainerClientsBrowseCounts(clients, memByClient, today, extra)
  const q = String(query ?? '').trim().toLowerCase()
  const filtered = filterTrainerClientsByBrowseMode(clients, memByClient, today, filter, extra).filter((c) => matchesQuery(c, q))
  if (filter === 'birthdays') {
    const sorted = sortClientsForBirthdayBrowse(filtered, today)
    const parts = partitionBirthdayBrowseClients(sorted, today)
    const items = withBirthdayBrowseSectionBreaks(sorted, today, { today: parts.today.length, upcoming: parts.upcoming.length })
    return { counts, total: sorted.length, items }
  }
  const sorted = isOutreachScenario(filter) ? sortClientsForOutreachFilter(filtered, filter, memByClient, NO_SENT, today) : filtered
  return { counts, total: sorted.length, items: sorted.map((client) => ({ type: 'client', client })) }
}

/** Строка списка: «до 10.11.2026 · 3/10», «истёк 29.09.2026 · 8/10» или подпись сигнала (как на планшете). */
export function coachMembershipFact(memList, today) {
  const active = pickUsableMembershipForDate(memList ?? [], today)
  if (active) return `до ${formatDateRu(active.end_date)} · ${membershipUsageLabel(active, [])}`
  const expiredLeft = pickExpiredMembershipWithRemaining(memList ?? [], today)
  if (expiredLeft) return `истёк ${formatDateRu(expiredLeft.end_date)} · ${membershipUsageLabel(expiredLeft, [])}`
  return membershipSignal(memList ?? [], today).factLabel || 'нет абонемента'
}

/**
 * Шторка: состояние каждого абонемента.
 * @returns {'current' | 'upcoming' | 'depleted' | 'past'}
 */
export function coachMembershipPhase(membership, memList, today) {
  const d = String(today ?? '').slice(0, 10)
  const active = pickUsableMembershipForDate(memList ?? [], d)
  if (active && String(active.id) === String(membership?.id)) return 'current'
  if (String(membership?.start_date ?? '') > d) return 'upcoming'
  if (String(membership?.end_date ?? '') >= d) return 'depleted'
  return 'past'
}

export const COACH_MEMBERSHIP_PHASE_RU = {
  current: 'Идёт',
  upcoming: 'Ждёт старт',
  depleted: 'Занятия закончились',
  past: 'Закончился',
}
