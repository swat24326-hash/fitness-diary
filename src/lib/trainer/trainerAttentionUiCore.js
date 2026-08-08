import { STALE_MAX_DAYS, STALE_TRAINING_DAYS } from './trainerClientOutreachCore.js'
import { MEMBERSHIP_EXPIRING_WITHIN_DAYS } from '../clientListSignals.js'

/** Секции «Сегодня внимание» — как блоки фильтров у админа. */
export const TRAINER_ATTENTION_GROUPS = [
  {
    id: 'base',
    title: 'База и поводы',
    keys: ['pnk', 'birthdays'],
  },
  {
    id: 'path',
    title: 'По абонементу',
    keys: ['expiring', 'expired_recent', 'stale', 'inactive'],
  },
]

/**
 * Карточки внимания тренера в порядке секций.
 * @param {{
 *   birthdays?: number,
 *   expiring?: number,
 *   expired_recent?: number,
 *   stale?: number,
 *   inactive?: number,
 *   pnk?: number,
 *   staleDays?: number,
 *   staleMaxDays?: number,
 * } | null} summary
 */
export function buildTrainerAttentionItems(summary) {
  if (!summary) return []
  const staleDays = Number(summary.staleDays) > 0 ? Number(summary.staleDays) : STALE_TRAINING_DAYS
  const staleMaxDays =
    Number(summary.staleMaxDays) > 0 ? Number(summary.staleMaxDays) : STALE_MAX_DAYS

  /** @type {Record<string, { key: string, count: number, label: string, hint: string, to: string }>} */
  const byKey = {
    pnk: {
      key: 'pnk',
      count: Number(summary.pnk) || 0,
      label: 'ПНК',
      hint: 'воронка',
      to: '/trainer/clients?filter=pnk',
    },
    birthdays: {
      key: 'birthdays',
      count: Number(summary.birthdays) || 0,
      label: 'ДР сегодня',
      hint: 'поздравление',
      to: '/trainer/clients?filter=birthdays',
    },
    expiring: {
      key: 'expiring',
      count: Number(summary.expiring) || 0,
      label: 'Истекает',
      hint: `1–${MEMBERSHIP_EXPIRING_WITHIN_DAYS} дней`,
      to: '/trainer/clients?filter=expiring',
    },
    expired_recent: {
      key: 'expired_recent',
      count: Number(summary.expired_recent) || 0,
      label: 'Закончился',
      hint: `< ${staleDays} дн. / лимит 0`,
      to: '/trainer/clients?filter=expired_recent',
    },
    stale: {
      key: 'stale',
      count: Number(summary.stale) || 0,
      label: 'Давно не был',
      hint: `${staleDays}–${staleMaxDays} дн. после конца`,
      to: '/trainer/clients?filter=stale',
    },
    inactive: {
      key: 'inactive',
      count: Number(summary.inactive) || 0,
      label: 'Не активные',
      hint: 'без абона · список в клиентах',
      to: '/trainer/clients?filter=inactive',
    },
  }

  return TRAINER_ATTENTION_GROUPS.flatMap((g) => g.keys.map((k) => byKey[k]).filter(Boolean))
}

/**
 * @param {ReturnType<typeof buildTrainerAttentionItems>} items
 */
export function groupTrainerAttentionItems(items) {
  const list = Array.isArray(items) ? items : []
  const byKey = new Map(list.map((c) => [c.key, c]))
  return TRAINER_ATTENTION_GROUPS.map((g) => ({
    id: g.id,
    title: g.title,
    cards: g.keys.map((k) => byKey.get(k)).filter(Boolean),
  })).filter((g) => g.cards.length > 0)
}
