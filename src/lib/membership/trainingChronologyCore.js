/**
 * Порядок завершённых тренировок / списаний в один день для номера «N/M».
 * Не created_at черновика: иначе «открыл форму → списал неявки → Закончить»
 * ставит проведённую раньше списаний.
 */

/**
 * Момент списания слота абонемента (ISO), для сортировки в пределах даты.
 * @param {object | null | undefined} t
 * @returns {string}
 */
export function trainingChronologyInstant(t) {
  const fromData = String(t?.data?.completed_at ?? '').trim()
  if (fromData && Number.isFinite(Date.parse(fromData))) return fromData
  const fromLoyalty = String(t?.data?.loyalty?.completed_at ?? '').trim()
  if (fromLoyalty && Number.isFinite(Date.parse(fromLoyalty))) return fromLoyalty
  return String(t?.created_at ?? '')
}

/**
 * По дате, затем по моменту завершения / списания, затем по id.
 * @param {object} a
 * @param {object} b
 */
export function compareTrainingsChronological(a, b) {
  const da = String(a?.date ?? '').slice(0, 10)
  const db = String(b?.date ?? '').slice(0, 10)
  if (da !== db) return da.localeCompare(db)
  const c = trainingChronologyInstant(a).localeCompare(trainingChronologyInstant(b))
  if (c) return c
  return String(a?.id ?? '').localeCompare(String(b?.id ?? ''))
}

/**
 * Ставит data.completed_at один раз при первом завершении / списании.
 * @param {object | null | undefined} data
 * @param {string} nowIso
 * @returns {object}
 */
export function stampTrainingCompletedAt(data, nowIso) {
  const src = data && typeof data === 'object' ? { ...data } : {}
  const existing = String(src.completed_at ?? '').trim()
  if (existing && Number.isFinite(Date.parse(existing))) return src
  const now = String(nowIso ?? '').trim()
  if (now && Number.isFinite(Date.parse(now))) src.completed_at = now
  return src
}
