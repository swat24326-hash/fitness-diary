/**
 * Нагрузочный клуб для стенда (docs/CAPACITY_PLAN.md, этап B). Только выдуманные данные.
 * Профиль — загруженный тренер прода 13.10 (p90: 25 клиентов, 335 тренировок за 90 дней, data ~4,3 КБ),
 * помноженный на цель: 300 тренеров, 60 тыс. клиентов в базе.
 * Строки отдаются по тренеру, чтобы не держать сотни мегабайт в памяти; запись — scripts/stand-load-seed.mjs.
 */

export const LOAD_CLUB_NAME = 'Нагрузочный клуб'
export const LOAD_LOGIN_PREFIX = 'load-t'

export const LOAD_DEFAULTS = {
  trainers: 300,
  clientsPerTrainer: 25,
  trainingsPerTrainer: 670,
  daysBack: 180,
  totalClients: 60_000,
  trainingDataBytes: 4300,
  clientSessions: 2000,
}

/** Писать только в локальную базу стенда: прод — Managed PG, стенд — PostgreSQL на той же ВМ. */
export function loadSeedGuardError({ databaseUrl, hostname }) {
  let host = ''
  try {
    host = new URL(String(databaseUrl ?? '')).hostname
  } catch {
    return 'DATABASE_URL не разобрать'
  }
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) return `База ${host} не локальная — нагрузочный клуб только на стенде`
  if (!/stand/i.test(String(hostname ?? ''))) return `Машина ${hostname} — не стенд`
  return null
}

export function addDaysIso(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** data тренировки ~targetBytes в JSON: упражнения с подходами, как у тренера в зале. */
export function buildTrainingData(targetBytes, membershipId) {
  const exercises = []
  const data = { exercises, note: 'Нагрузочный тест', membership_id: membershipId }
  for (let i = 0; JSON.stringify(data).length < targetBytes; i++) {
    exercises.push({
      name: `Упражнение ${i + 1}`,
      muscle_group: 'Ноги',
      sets: Array.from({ length: 4 }, (_, s) => ({ reps: 10 + s, weight_kg: 40 + 5 * s, rpe: 7, hr_after: 120 + s })),
    })
  }
  return data
}

/**
 * @param {{ index: number, clubId: string, typeId: string, passwordHash: string, today: string, newId: () => string, opts?: Partial<typeof LOAD_DEFAULTS> }} p
 */
export function buildLoadTrainer({ index, clubId, typeId, passwordHash, today, newId, opts = {} }) {
  const o = { ...LOAD_DEFAULTS, ...opts }
  const login = `${LOAD_LOGIN_PREFIX}${String(index + 1).padStart(4, '0')}`
  const user = {
    id: newId(),
    name: `Нагрузка Тренер ${index + 1}`,
    email: `${login}@staging.invalid`,
    role: 'trainer',
    login,
    password_hash: passwordHash,
    is_active: true,
    club_id: clubId,
  }
  const clients = Array.from({ length: o.clientsPerTrainer }, (_, c) => ({
    id: newId(),
    name: `Нагрузка Клиент ${index + 1}-${c + 1}`,
    phone: `+79${String(index * 1000 + c).padStart(9, '0')}`,
    trainer_id: user.id,
    club_id: clubId,
  }))
  const memberships = clients.map((c) => ({
    id: newId(),
    client_id: c.id,
    club_id: clubId,
    membership_type_id: typeId,
    start_date: addDaysIso(today, -30),
    end_date: addDaysIso(today, 60),
    total_trainings: 12,
    used_trainings: 4,
    status: 'active',
    hall: 'pz',
  }))
  const membershipByClient = new Map(memberships.map((m) => [m.client_id, m.id]))
  const trainings = Array.from({ length: o.trainingsPerTrainer }, (_, t) => {
    const client = clients[t % clients.length]
    return {
      id: newId(),
      client_id: client.id,
      trainer_id: user.id,
      club_id: clubId,
      date: addDaysIso(today, -Math.floor((t * o.daysBack) / o.trainingsPerTrainer)),
      type: 'Силовая',
      status: 'completed',
      data: buildTrainingData(o.trainingDataBytes, membershipByClient.get(client.id)),
    }
  })
  const health_cards = clients.filter((_, c) => c % 5 === 0).map((c) => ({ id: newId(), client_id: c.id }))
  const client_weight_entries = clients.map((c, k) => ({
    id: newId(),
    client_id: c.id,
    date: addDaysIso(today, -(k % 60)),
    weight_kg: 70 + (k % 20),
    source: 'manual',
  }))
  return { user, clients, memberships, trainings, health_cards, client_weight_entries }
}

/** Клиенты без тренера (АЗ) — добивают базу до totalClients, как общая база сети. */
export function buildDeskClients({ count, offset, clubId, newId }) {
  return Array.from({ length: count }, (_, i) => ({
    id: newId(),
    name: `Нагрузка АЗ ${offset + i + 1}`,
    phone: `+78${String(offset + i).padStart(9, '0')}`,
    club_id: clubId,
    desk_hall: 'az',
  }))
}

/** Порядок вставки строк тренера по внешним ключам. */
export const LOAD_TRAINER_TABLES = ['users', 'clients', 'memberships', 'trainings', 'health_cards', 'client_weight_entries']
