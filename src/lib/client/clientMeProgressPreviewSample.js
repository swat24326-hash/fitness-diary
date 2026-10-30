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
    client: { name: 'Мария Иванова', has_trainer: true },
    club: { name: 'Fit City' },
    next_session: {
      date: '2026-10-20',
      time: '13:00–14:00',
      trainer_name: 'Марина Попова',
    },
    memberships: {
      current: [
        {
          hall: 'pz',
          hall_mark: 'ПЗ',
          label: 'ПЗ 17',
          status: 'active',
          total: 17,
          used: 4,
          remaining: 13,
          days_left: 54,
          start_date: '2026-09-01',
          end_date: '2026-12-11',
          /** Как в ответе /api/client-me — для DEV /me/trainings-preview */
          visits: [
            {
              id: 't1',
              date: '2026-09-20',
              focus: 'Ноги',
              kg: 61.2,
              no_show: false,
              trainer_name: 'Марина Попова',
            },
            {
              id: 't2',
              date: '2026-09-28',
              focus: null,
              kg: null,
              no_show: true,
              trainer_name: 'Марина Попова',
            },
            {
              id: 't3',
              date: '2026-10-05',
              focus: 'Спина',
              kg: 60.5,
              no_show: false,
              trainer_name: 'Марина Попова',
            },
            {
              id: 't4',
              date: '2026-10-16',
              focus: 'Силовая',
              kg: 59.9,
              no_show: false,
              trainer_name: 'Олег',
            },
          ],
        },
      ],
    },
    progress: {
      visits_total: 48,
      visits_30d: 6,
      last_visit: '2026-10-16',
      weeks_streak: 3,
      weights: [
        { date: '2026-08-01', kg: 62.4, source: 'club' },
        { date: '2026-08-20', kg: 61.8, source: 'club' },
        { date: '2026-09-03', kg: 61.2, source: 'client', id: 'pw-self-1' },
        { date: '2026-09-25', kg: 60.5, source: 'club' },
        { date: '2026-10-18', kg: 59.9, source: 'client', id: 'pw-self-2' },
      ],
      measurements: [
        {
          date: '2026-08-01',
          source: 'club',
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
          source: 'client',
          id: 'pm-self-1',
          editable: true,
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

/** DEV: чистый АЗ — группа в «Следующей», без бонусов ПЗ. /me/home-preview?az=1 */
export function clientMeHomeAzPreviewSample() {
  const base = clientMeHomePreviewSample()
  return {
    ...base,
    client: { name: 'Андреенко', has_trainer: false },
    next_session: {
      date: '2026-10-31',
      time: '19:00–20:00',
      trainer_name: 'Олег',
      kind: 'group',
      direction_name: 'Бокс',
    },
    progress: {
      ...base.progress,
      visits_total: 5,
      visits_30d: 3,
      first_visit: '2026-09-10',
      last_visit: '2026-10-27',
      weeks_streak: 2,
      weights: [],
      measurements: [],
    },
    memberships: {
      current: [
        {
          hall: 'az',
          hall_mark: 'АЗ · Бокс',
          label: 'АЗ · Бокс',
          status: 'active',
          total: 12,
          used: 5,
          remaining: 7,
          days_left: 40,
          start_date: '2026-09-01',
          end_date: '2026-12-10',
          visits: [
            { id: 'azv1', date: '2026-09-10', focus: 'Бокс', kg: null, no_show: false, trainer_name: null, kind: 'desk' },
            { id: 'azv2', date: '2026-09-24', focus: 'Бокс', kg: null, no_show: false, trainer_name: null, kind: 'desk' },
            { id: 'azv3', date: '2026-10-08', focus: 'Бокс', kg: null, no_show: false, trainer_name: null, kind: 'desk' },
            { id: 'azv4', date: '2026-10-20', focus: 'Бокс', kg: null, no_show: false, trainer_name: null, kind: 'desk' },
            { id: 'azv5', date: '2026-10-27', focus: 'Бокс', kg: null, no_show: false, trainer_name: null, kind: 'desk' },
          ],
        },
      ],
      last_ended: null,
    },
    loyalty: null,
  }
}

/**
 * DEV: смесь ПЗ+АЗ на главной — главный абон по срочности, метки зала, бонусы ПЗ.
 * /me/home-preview?mixed=1
 */
export function clientMeHomeMixedPreviewSample() {
  const base = clientMeHomePreviewSample()
  const az = clientMeTrainingsMixedPreviewSample().memberships.current.find((m) => m.hall === 'az' && m.label.includes('Бокс'))
  return {
    ...base,
    client: { name: 'Мария Иванова', has_trainer: true },
    memberships: {
      current: [
        {
          ...base.memberships.current[0],
          hall: 'pz',
          hall_mark: 'ПЗ',
          days_left: 54,
          remaining: 13,
        },
        {
          ...(az ?? {}),
          hall: 'az',
          hall_mark: 'АЗ · Бокс',
          label: 'АЗ · Бокс',
          status: 'active',
          total: 12,
          used: 5,
          remaining: 7,
          days_left: 12,
          start_date: '2026-08-01',
          end_date: '2026-11-01',
          visits: az?.visits ?? [],
        },
      ],
      last_ended: null,
    },
    loyalty: base.loyalty,
  }
}

/**
 * DEV: смешанная жизнь ПЗ+АЗ+ТЗ для /me/trainings-preview?mixed=1
 * Карточки как задумано в CLIENT_APP (канон ⏸): все действующие абоны на вкладке.
 */
export function clientMeTrainingsMixedPreviewSample() {
  const base = clientMeHomePreviewSample()
  return {
    ...base,
    client: { name: 'Мария Иванова' },
    memberships: {
      current: [
        {
          hall: 'pz',
          label: 'ПЗ 17',
          status: 'active',
          total: 17,
          used: 4,
          remaining: 13,
          days_left: 54,
          start_date: '2026-09-01',
          end_date: '2026-12-11',
          visits: base.memberships.current[0].visits,
        },
        {
          hall: 'az',
          hall_mark: 'АЗ · Бокс',
          label: 'АЗ · Бокс',
          status: 'active',
          total: 12,
          used: 5,
          remaining: 7,
          days_left: 120,
          start_date: '2026-08-01',
          end_date: '2027-03-15',
          visits: [
            { id: 'az3', date: '2026-10-20', focus: 'Бокс', kg: null, no_show: false, trainer_name: null, kind: 'desk' },
            { id: 'az2', date: '2026-10-24', focus: 'Бокс', kg: null, no_show: false, trainer_name: null, kind: 'desk' },
            { id: 'az1', date: '2026-10-27', focus: 'Бокс', kg: null, no_show: false, trainer_name: null, kind: 'desk' },
          ],
        },
        {
          hall: 'az',
          hall_mark: 'АЗ · Степ',
          label: 'АЗ · Степ',
          status: 'active',
          total: 8,
          used: 2,
          remaining: 6,
          days_left: 45,
          start_date: '2026-09-15',
          end_date: '2026-12-15',
          visits: [
            { id: 'azs1', date: '2026-10-12', focus: 'Степ', kg: null, no_show: false, trainer_name: null, kind: 'desk' },
            { id: 'azs2', date: '2026-10-26', focus: 'Степ', kg: null, no_show: false, trainer_name: null, kind: 'desk' },
          ],
        },
        {
          hall: 'tz',
          hall_mark: 'ТЗ',
          label: 'ТЗ',
          status: 'active',
          total: null,
          used: 0,
          remaining: null,
          days_left: 200,
          start_date: '2026-06-01',
          end_date: '2027-06-01',
          visits: [],
        },
      ],
    },
  }
}
