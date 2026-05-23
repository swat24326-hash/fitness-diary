import { getDb } from './localDb'
import { isSupabaseConfigured } from './supabase'
import { saveLocalWithSync } from './syncService'

/** Демо-строки в том же формате, что и в админке «Упражнения». */
const DEMO_EXERCISES = [
  {
    name: 'Приседания со штангой',
    muscle_group: 'Ноги',
    primary_muscles: 'Квадрицепс, ягодицы',
    comment: 'Демо для проверки справочника',
  },
  {
    name: 'Жим штанги лёжа',
    muscle_group: 'Грудь',
    primary_muscles: 'Грудные, трицепс',
    comment: 'Демо для проверки справочника',
  },
]

/**
 * Если в IndexedDB ещё нет ни одного упражнения — добавляет пару демо-записей
 * (как через админку: локальная запись + очередь синка).
 */
export async function ensureDemoExercisesSeeded() {
  /* С Supabase справочник с сервера; демо-insert даёт 409 (name UNIQUE). */
  if (isSupabaseConfigured()) return

  const db = await getDb()
  const existing = await db.getAll('exercises')
  if (existing.length > 0) return

  const now = new Date().toISOString()
  for (const row of DEMO_EXERCISES) {
    const id = crypto.randomUUID()
    const record = {
      id,
      name: row.name,
      muscle_group: row.muscle_group,
      primary_muscles: row.primary_muscles,
      comment: row.comment,
      created_at: now,
    }
    await saveLocalWithSync('exercises', record, { table_name: 'exercises', operation: 'insert', remote_id: null })
  }
}
