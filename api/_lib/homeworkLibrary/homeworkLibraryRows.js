/**
 * Все правки библиотеки ДЗ (одна на сеть, сотни строк максимум) — для trainer-pull, admin-data и cron авто-ДЗ.
 * Таблицы ещё нет (миграция не применена) — пусто: работает встроенная библиотека.
 */
export async function loadHomeworkLibraryRows(db) {
  const { data, error } = await db.from('homework_library').select('*').order('id', { ascending: true })
  if (error?.code === '42P01') return []
  if (error) throw error
  return data ?? []
}
