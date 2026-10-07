/** Тестовый клуб: один тренер, одна клиентка, абонемент на 8 тренировок. */
import { randomUUID } from 'node:crypto'

export const CLUB_ID = 'e2e00000-0000-4000-8000-0000000000c1'
export const TRAINER_ID = 'e2e00000-0000-4000-8000-0000000000a1'
export const CLIENT_ID = 'e2e00000-0000-4000-8000-0000000000b1'
export const MEMBERSHIP_ID = 'e2e00000-0000-4000-8000-0000000000d1'
export const PAST_TRAINING_ID = 'e2e00000-0000-4000-8000-0000000000e1'
export const EXERCISE_ID = 'e2e00000-0000-4000-8000-0000000000f1'
export const TRAINER_LOGIN = 'e2e_trainer'
export const TRAINER_PASSWORD = randomUUID()
export const CLIENT_NAME = 'Тестова Анна'

function isoDay(offsetDays) {
  const d = new Date(Date.now() + offsetDays * 864e5)
  return d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Moscow' })
}

export function trainerClubSeed() {
  const now = new Date().toISOString()
  return {
    users: [
      {
        id: TRAINER_ID,
        login: TRAINER_LOGIN,
        email: `${TRAINER_LOGIN}@trainer.local`,
        password: TRAINER_PASSWORD,
        role: 'trainer',
        name: 'Тренер Тестов',
        club_id: CLUB_ID,
      },
    ],
    clubs: [{ id: CLUB_ID, name: 'E2E клуб', is_active: true, created_at: now }],
    clients: [
      {
        id: CLIENT_ID,
        trainer_id: TRAINER_ID,
        club_id: CLUB_ID,
        name: CLIENT_NAME,
        phone: '+7 900 000-00-01',
        birth_date: null,
        created_at: now,
        updated_at: now,
      },
    ],
    memberships: [
      {
        id: MEMBERSHIP_ID,
        client_id: CLIENT_ID,
        club_id: CLUB_ID,
        start_date: isoDay(-10),
        end_date: isoDay(50),
        total_trainings: 8,
        used_trainings: 1,
        created_at: now,
        updated_at: now,
      },
    ],
    trainings: [
      {
        id: PAST_TRAINING_ID,
        client_id: CLIENT_ID,
        trainer_id: TRAINER_ID,
        club_id: CLUB_ID,
        date: isoDay(-5),
        type: 'Силовая',
        status: 'completed',
        data: { membership_id: MEMBERSHIP_ID, exercises: [] },
        created_at: now,
        updated_at: now,
      },
    ],
    health_cards: [],
    exercises: [
      { id: EXERCISE_ID, name: 'Жим лёжа', muscle_group: 'Грудь', primary_muscles: null, comment: null, created_at: now },
      {
        id: 'e2e00000-0000-4000-8000-0000000000f2',
        name: 'Присед со штангой',
        muscle_group: 'Ноги',
        primary_muscles: null,
        comment: null,
        created_at: now,
      },
    ],
  }
}

export const DONE_TODAY_ID = 'e2e00000-0000-4000-8000-0000000000e2'

/** Завершённая сегодня тренировка со всеми вкладками — как после реального «Закончить». */
export function completedTodaySeed() {
  const seed = trainerClubSeed()
  const now = new Date().toISOString()
  seed.memberships[0].used_trainings = 2
  seed.trainings.push({
    id: DONE_TODAY_ID,
    client_id: CLIENT_ID,
    trainer_id: TRAINER_ID,
    club_id: CLUB_ID,
    date: isoDay(0),
    type: 'Силовая',
    status: 'completed',
    data: {
      membership_id: MEMBERSHIP_ID,
      pre_weight_kg: '62',
      training_focus: 'Сила',
      mood: '4',
      desire: '4',
      sleep_hours: '8',
      hours_after_meal: '2',
      warmup: 'Суставная гимнастика',
      warmup_duration_min: '10',
      exercises: [
        {
          id: 'e2e00000-0000-4000-8000-00000000ee01',
          name: 'Жим лёжа',
          catalog_exercise_id: EXERCISE_ID,
          muscle_focus: '',
          format: 'Силовая',
          laterality: null,
          sets: [{ reps: '10', weight_kg: '40', tut_sec: '', load: '', rpe: '', hr_after: '' }],
          superset_group: null,
        },
      ],
      cooldown: 'Растяжка',
      cooldown_duration_min: '5',
      trainer_comment: '',
      stars: '5',
    },
    created_at: now,
    updated_at: now,
  })
  return seed
}

export const CLIENT2_ID = 'e2e00000-0000-4000-8000-0000000000b2'
export const CLIENT2_NAME = 'Проверкин Борис'

/** Второй клиент того же тренера — для двух открытых черновиков. */
export function twoClientsSeed() {
  const seed = trainerClubSeed()
  const [client] = seed.clients
  const [membership] = seed.memberships
  const [past] = seed.trainings
  seed.clients.push({ ...client, id: CLIENT2_ID, name: CLIENT2_NAME, phone: '+7 900 000-00-02' })
  seed.memberships.push({ ...membership, id: 'e2e00000-0000-4000-8000-0000000000d2', client_id: CLIENT2_ID })
  seed.trainings.push({
    ...past,
    id: 'e2e00000-0000-4000-8000-0000000000e3',
    client_id: CLIENT2_ID,
    data: { ...past.data, membership_id: 'e2e00000-0000-4000-8000-0000000000d2' },
  })
  return seed
}

export { isoDay }
