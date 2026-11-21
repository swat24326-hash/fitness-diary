import { postClientMe } from './clientSession.js'

/** День дневника: список + итог. */
export function fetchFoodDiaryDay(entryDate) {
  return postClientMe({ action: 'food-diary-day', entry_date: entryDate })
}

/** Создать / обновить запись. */
export function upsertFoodDiaryEntry(payload) {
  return postClientMe({ action: 'food-diary-upsert', ...payload })
}

/** Удалить свою запись. */
export function deleteFoodDiaryEntry(id) {
  return postClientMe({ action: 'food-diary-delete', id })
}

/** Поиск по полке клуба + встроенному каталогу. */
export function searchFoodDiaryCatalog(query) {
  return postClientMe({ action: 'food-diary-search', query })
}

/** Штрихкод через Open Food Facts (сервер). */
export function lookupFoodDiaryBarcode(barcode) {
  return postClientMe({ action: 'food-diary-barcode', barcode })
}

/** Часто добавляемые продукты. */
export function fetchFoodDiaryFrequent(limit = 8) {
  return postClientMe({ action: 'food-diary-frequent', limit })
}

/** Скопировать день (или один приём) на другую дату. */
export function copyFoodDiaryDay({ from_date, to_date, meal_key }) {
  return postClientMe({ action: 'food-diary-copy', from_date, to_date, meal_key })
}

/** Вода за день. */
export function fetchFoodDiaryWater(entryDate) {
  return postClientMe({ action: 'food-diary-water', entry_date: entryDate })
}

export function setFoodDiaryWater(entryDate, ml) {
  return postClientMe({ action: 'food-diary-water-set', entry_date: entryDate, ml })
}

/** Сводка за 7 дней, заканчиваясь endDate. */
export function fetchFoodDiaryWeek(endDate) {
  return postClientMe({ action: 'food-diary-week', end_date: endDate })
}

/** Положить день рациона в дневник (mode: add | replace; meal_keys — опционально). */
export function importFoodDiaryFromPlan({
  entry_date,
  plan_id,
  plan_payload,
  day_index = 0,
  mode = 'add',
  meal_keys,
}) {
  return postClientMe({
    action: 'food-diary-from-plan',
    entry_date,
    plan_id,
    plan_payload,
    day_index,
    mode,
    meal_keys,
  })
}

/** Свои цели КБЖУ. */
export function fetchFoodDiaryTargets() {
  return postClientMe({ action: 'food-diary-targets' })
}

export function setFoodDiaryTargets(payload) {
  return postClientMe({ action: 'food-diary-targets-set', ...payload })
}
