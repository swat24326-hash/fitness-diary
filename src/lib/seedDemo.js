import { getDb, putStore } from './localDb'

export const demoTrainerId = '00000000-0000-4000-8000-000000000001'
/** Демо-клуб в локальном режиме: тренер и клиент привязаны к нему. */
export const DEMO_CLUB_ID = '00000000-0000-4000-8000-000000000010'
/** Фиксированные UUID демо-данных (не учитывать при проверке «можно ли удалить клуб»). */
export const DEMO_SEED_CLIENT_ID = '00000000-0000-4000-8000-000000000002'
export const DEMO_SEED_MEMBERSHIP_ID = '00000000-0000-4000-8000-000000000003'
export const DEMO_SEED_TRAINING_ID = '00000000-0000-4000-8000-000000000004'

export async function ensureDemoData() {
  const db = await getDb()
  const existing = await db.get('clients', DEMO_SEED_CLIENT_ID)
  if (existing) return

  const now = new Date().toISOString()
  const today = now.slice(0, 10)
  const clubId = DEMO_CLUB_ID

  await putStore('clubs', {
    id: clubId,
    name: 'Демо-клуб',
    address: 'г. Москва',
    phone: null,
    is_active: true,
    created_at: now,
  })

  await putStore('clients', {
    id: DEMO_SEED_CLIENT_ID,
    trainer_id: demoTrainerId,
    club_id: clubId,
    name: 'Демо Клиент',
    phone: '+7 900 000-00-00',
    birth_date: null,
    created_at: now,
  })

  await putStore('memberships', {
    id: DEMO_SEED_MEMBERSHIP_ID,
    client_id: DEMO_SEED_CLIENT_ID,
    club_id: clubId,
    start_date: today,
    end_date: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10),
    total_trainings: 12,
    used_trainings: 3,
    created_at: now,
  })

  await putStore('trainings', {
    id: DEMO_SEED_TRAINING_ID,
    client_id: DEMO_SEED_CLIENT_ID,
    trainer_id: demoTrainerId,
    club_id: clubId,
    date: today,
    type: 'Силовая',
    status: 'draft',
    data: { step: 'warmup' },
    created_at: now,
    synced: false,
  })
}
