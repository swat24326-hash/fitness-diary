/**
 * Пример данных главной /me для DEV-превью (без API и логина).
 */
export const CLIENT_PROGRESS_PREVIEW_PATH = '/me/progress-preview'
export const CLIENT_HOME_PREVIEW_PATH = '/me/home-preview'

/** Полный ответ как у /api/client-me — блоки главной. */
export function clientMeHomePreviewSample() {
  const asOf = '2026-10-18'
  return {
    as_of: asOf,
    client: { name: 'Мария Иванова' },
    club: { name: 'Fit City' },
    next_session: {
      date: '2026-10-20',
      time: '13:00–14:00',
      trainer_name: 'Марина Попова',
    },
    memberships: {
      current: [
        {
          status: 'active',
          total: 17,
          used: 4,
          remaining: 13,
          days_left: 54,
          start_date: '2026-09-01',
          end_date: '2026-12-11',
        },
      ],
    },
    progress: {
      visits_total: 48,
      visits_30d: 6,
      last_visit: '2026-10-16',
      weeks_streak: 3,
      weights: [
        { date: '2026-08-01', kg: 62.4 },
        { date: '2026-08-20', kg: 61.8 },
        { date: '2026-09-03', kg: 61.2 },
        { date: '2026-09-25', kg: 60.5 },
        { date: '2026-10-18', kg: 59.9 },
      ],
      measurements: [
        {
          date: '2026-08-01',
          values: {
            chest: 81,
            arm_r: 24.5,
            waist_upper: 70,
            waist_lower: 73.5,
            glutes: 85,
            thigh_r: 46,
          },
        },
        {
          date: '2026-10-18',
          values: {
            chest: 85.5,
            arm_r: 24,
            waist_upper: 70,
            waist_lower: 77,
            glutes: 88.5,
            thigh_r: 45.5,
          },
        },
      ],
    },
    loyalty: {
      points: 120,
      enabled: true,
      can_redeem: true,
      unlock_on: null,
    },
  }
}

/** Только прогресс (вес + обмеры) — для узкого превью. */
export function clientMeProgressPreviewSample() {
  return clientMeHomePreviewSample().progress
}
