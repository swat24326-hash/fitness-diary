import { buildAdminClubQueryHref } from './adminClientQuickFilters.js'
import { buildAdminHomeSoftSignals } from './adminHomeSoftSignalsCore.js'

/**
 * Фиксированный ряд главной админа / управляющего: Продажи | ПНК | Качество ведения | Планёрка.
 * Карточки видны всегда: нет данных — пустое состояние, а не скрытый слот.
 */
export const ADMIN_HOME_GLANCE_EMPTY = {
  pnk: { title: 'ПНК', text: 'Открытых ПНК нет', cta: 'Доска ПНК' },
  coachQuality: { title: 'Качество ведения', text: 'Пока нет оценок за месяц', cta: 'Статистика' },
  planerka: { title: 'Планёрка', text: 'Активных заданий нет', cta: 'Открыть планёрку' },
}

/**
 * @param {{ hasData?: boolean, loading?: boolean }} opts
 * @returns {'data' | 'skeleton' | 'empty'}
 */
export function resolveHomeGlanceSlotState(opts = {}) {
  if (opts.hasData) return 'data'
  return opts.loading ? 'skeleton' : 'empty'
}

/**
 * @param {{ coachQuality?: object | null, loading?: boolean, clubId?: string, statsPath?: string }} opts
 */
export function buildCoachQualityHomeSlot(opts = {}) {
  const clubId = String(opts.clubId ?? '').trim()
  const statsPath = String(opts.statsPath ?? '/admin/statistics').trim() || '/admin/statistics'
  const signal =
    buildAdminHomeSoftSignals({ coachQuality: opts.coachQuality, clubId, statsPath }).find(
      (s) => s.id === 'coach-quality',
    ) ?? null
  return {
    state: resolveHomeGlanceSlotState({ hasData: Boolean(signal), loading: opts.loading }),
    signal,
    href: buildAdminClubQueryHref(statsPath, { clubId, period: 'month', panel: 'coachQuality' }),
  }
}
