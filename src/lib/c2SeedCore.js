/**
 * Тестовый клуб для стенда C2 (волна 2 R2). Только выдуманные данные — не прод-ПДн.
 * Без React/IDB/pg: строки для вставки, запись делает scripts/c2-seed-staging.mjs.
 */

export const C2_SEED_STAFF = [
  { key: 'admin', role: 'admin', login: 'c2-admin', name: 'Стенд Админ' },
  { key: 'trainer', role: 'trainer', login: 'c2-trainer', name: 'Стенд Тренер' },
  { key: 'sales', role: 'sales_manager', login: 'c2-sales', name: 'Стенд Менеджер' },
  { key: 'supervisor', role: 'supervisor', login: 'c2-supervisor', name: 'Стенд Управляющий' },
]

export const C2_SEED_EMAIL_DOMAIN = 'staging.invalid'
const CLIENT_COUNT = 3

/** Засевать можно только пустую базу: иначе перемешаем тест с чужими строками. */
export function c2SeedGuardError(counts) {
  const busy = Object.entries(counts ?? {})
    .filter(([, n]) => Number(n) > 0)
    .map(([table]) => table)
  return busy.length ? `База не пустая (${busy.join(', ')}) — seed только на чистой схеме.` : null
}

function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * @param {{ today: string, newId: () => string, passwordHashes: Record<string, string> }} opts
 */
export function buildC2SeedRows({ today, newId, passwordHashes }) {
  const clubId = newId()
  const staff = C2_SEED_STAFF.map((s) => ({
    id: newId(),
    name: s.name,
    email: `${s.login}@${C2_SEED_EMAIL_DOMAIN}`,
    role: s.role,
    login: s.login,
    password_hash: passwordHashes[s.key],
    is_active: true,
    club_id: clubId,
  }))
  const trainerId = staff[C2_SEED_STAFF.findIndex((s) => s.key === 'trainer')].id
  const typeId = newId()
  const clients = Array.from({ length: CLIENT_COUNT }, (_, i) => ({
    id: newId(),
    name: `Тест Клиент ${i + 1}`,
    phone: `+7000000000${i + 1}`,
    trainer_id: trainerId,
    club_id: clubId,
  }))
  return {
    clubs: [{ id: clubId, name: 'Тестовый клуб C2', is_active: true }],
    users: staff,
    membership_types: [{ id: typeId, club_id: clubId, code: 'ПТ-10', sort_order: 1, trainer_pay_per_session: 500 }],
    clients,
    memberships: clients.map((c) => ({
      id: newId(),
      client_id: c.id,
      club_id: clubId,
      membership_type_id: typeId,
      start_date: today,
      end_date: addDays(today, 60),
      total_trainings: 10,
      used_trainings: 0,
      status: 'active',
      hall: 'pz',
    })),
  }
}

/** Порядок вставки по внешним ключам. */
export const C2_SEED_TABLE_ORDER = ['clubs', 'users', 'membership_types', 'clients', 'memberships']
