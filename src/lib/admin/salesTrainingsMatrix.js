/** Матрица тренировок в отчёте продаж: тренер × тип абонемента. */

import { buildTrainerPayRateMap, computePayrollFromMatrixRows } from './trainerPayrollCore.js'

export const SALES_TRAINING_TYPE_NONE = '__none__'
/** Синтетический id для ввода «по клубу» без разбивки по тренерам (менеджер). */
export const SALES_TRAINING_CLUB_ID = '__club__'

export function salesTrainingCellKey(trainerId, typeId) {
  const tid = String(trainerId ?? '').trim()
  const typeKey = typeId == null || typeId === '' ? SALES_TRAINING_TYPE_NONE : String(typeId).trim()
  return `${tid}|${typeKey}`
}

/** @param {Array<{ trainer_id?: string, membership_type_id?: string | null, count?: number }>} rows */
export function matrixRowsToInputMap(rows) {
  const map = {}
  for (const row of rows ?? []) {
    const trainerId = String(row?.trainer_id ?? '').trim()
    if (!trainerId) continue
    const typeId = row?.membership_type_id == null ? null : String(row.membership_type_id).trim()
    const key = salesTrainingCellKey(trainerId, typeId)
    map[key] = String(Math.trunc(Number(row?.count) || 0))
  }
  return map
}

/**
 * @param {Record<string, string>} inputMap
 * @param {string[]} trainerIds
 * @param {Array<{ id: string }>} membershipTypes active types only
 */
export function inputMapToMatrixRows(inputMap, trainerIds, membershipTypes) {
  const rows = []
  const typeIds = [
    ...(membershipTypes ?? []).map((t) => String(t.id ?? '').trim()).filter(Boolean),
    null,
  ]
  for (const trainerId of trainerIds ?? []) {
    const tid = String(trainerId ?? '').trim()
    if (!tid) continue
    for (const typeId of typeIds) {
      const key = salesTrainingCellKey(tid, typeId)
      const raw = inputMap?.[key]
      if (raw == null || raw === '') continue
      const count = Math.floor(Number(String(raw).replace(/\s/g, '').replace(',', '.')))
      if (!Number.isFinite(count) || count < 0) {
        return { ok: false, error: 'Тренировки по картам: целые числа ≥ 0' }
      }
      if (count === 0) continue
      rows.push({
        trainer_id: tid,
        membership_type_id: typeId,
        count,
      })
    }
  }
  return { ok: true, rows }
}

function parseMatrixCellCount(raw) {
  if (raw == null || raw === '') return 0
  const n = Math.floor(Number(String(raw).replace(/\s/g, '').replace(',', '.')))
  return Number.isFinite(n) && n > 0 ? n : 0
}

/**
 * Свести per-trainer карту к одной строке «по клубу» для UI менеджера.
 * @param {Record<string, string>} inputMap
 * @param {string[]} trainerIds
 * @param {Array<{ typeId: string }>} columns
 */
export function clubAggregateInputMap(inputMap, trainerIds, columns) {
  const typeIds = (columns ?? []).map((c) => c.typeId)
  const result = {}
  let hasClubRows = false
  for (const typeId of typeIds) {
    const clubKey = salesTrainingCellKey(SALES_TRAINING_CLUB_ID, typeId === SALES_TRAINING_TYPE_NONE ? null : typeId)
    const clubRaw = inputMap?.[clubKey]
    if (clubRaw != null && clubRaw !== '') {
      hasClubRows = true
      result[clubKey] = clubRaw
    }
  }
  if (hasClubRows) return result

  for (const typeId of typeIds) {
    let sum = 0
    for (const trainerId of trainerIds ?? []) {
      const key = salesTrainingCellKey(trainerId, typeId === SALES_TRAINING_TYPE_NONE ? null : typeId)
      sum += parseMatrixCellCount(inputMap?.[key])
    }
    if (sum > 0) {
      const clubKey = salesTrainingCellKey(SALES_TRAINING_CLUB_ID, typeId === SALES_TRAINING_TYPE_NONE ? null : typeId)
      result[clubKey] = String(sum)
    }
  }
  return result
}

/** @param {Array<{ count?: number }>} rows */
export function sumMatrixRows(rows) {
  return (rows ?? []).reduce((s, r) => s + (Number(r.count) || 0), 0)
}

/** Итого без «Без типа» — как столбец «Итого» в админ-таблице. */
export function sumTypedMatrixRows(rows) {
  return (rows ?? [])
    .filter((r) => r?.membership_type_id != null && String(r.membership_type_id).trim())
    .reduce((s, r) => s + (Number(r.count) || 0), 0)
}

/**
 * @param {Array<{ id: string, code?: string, sort_order?: number, is_active?: boolean }>} membershipTypes
 * @param {{ includeInactive?: boolean }} [opts] — для отчёта продаж показываем все типы клуба
 */
export function buildTrainingsMatrixColumns(membershipTypes, opts = {}) {
  const includeInactive = opts.includeInactive !== false
  const cols = (membershipTypes ?? [])
    .filter((t) => t?.trainer_assignable !== false)
    .filter((t) => includeInactive || t?.is_active !== false)
    .sort(
      (a, b) =>
        (Number(a?.sort_order) || 0) - (Number(b?.sort_order) || 0) ||
        String(a?.code ?? '').localeCompare(String(b?.code ?? ''), 'ru'),
    )
    .map((t) => ({
      typeId: String(t.id),
      code: String(t.code ?? '—').trim() || '—',
      inactive: t?.is_active === false,
    }))
  cols.push({ typeId: SALES_TRAINING_TYPE_NONE, code: 'Без типа', inactive: false })
  return cols
}

/** Столбцы типов абонементов без «Без типа». */
export function typedTrainingsMatrixColumns(columns) {
  return (columns ?? []).filter((c) => c.typeId !== SALES_TRAINING_TYPE_NONE)
}

/**
 * Преобразовать сохранённую матрицу в формат MembershipTypeStatsTable.
 * @param {Array<{ trainer_id: string, membership_type_id: string | null, count: number }>} rows
 * @param {Array<{ id: string, code?: string }>} membershipTypes
 */
export function matrixRowsToMembershipStats(rows, membershipTypes) {
  const codeById = new Map()
  for (const t of membershipTypes ?? []) {
    const id = String(t?.id ?? '').trim()
    if (id) codeById.set(id, String(t.code ?? '—').trim() || '—')
  }

  const clubTypeMap = new Map()
  const trainerTypeMap = new Map()
  const hasClubAggregate = (rows ?? []).some((row) => {
    const tid = String(row?.trainer_id ?? '').trim()
    return tid === SALES_TRAINING_CLUB_ID && (Number(row?.count) || 0) > 0
  })

  for (const row of rows ?? []) {
    const trainerId = String(row.trainer_id ?? '').trim()
    const typeKey =
      row.membership_type_id == null || row.membership_type_id === ''
        ? SALES_TRAINING_TYPE_NONE
        : String(row.membership_type_id).trim()
    const count = Number(row.count) || 0
    if (!trainerId || count <= 0) continue

    const isClubRow = trainerId === SALES_TRAINING_CLUB_ID
    if (isClubRow || !hasClubAggregate) {
      clubTypeMap.set(typeKey, (clubTypeMap.get(typeKey) || 0) + count)
    }
    if (!isClubRow) {
      if (!trainerTypeMap.has(trainerId)) trainerTypeMap.set(trainerId, new Map())
      const tm = trainerTypeMap.get(trainerId)
      tm.set(typeKey, (tm.get(typeKey) || 0) + count)
    }
  }

  const label = (typeKey) => {
    if (typeKey === SALES_TRAINING_TYPE_NONE) return 'Без типа'
    return codeById.get(typeKey) || '—'
  }

  const byType = [...clubTypeMap.entries()]
    .map(([typeKey, count]) => ({
      typeId: typeKey === SALES_TRAINING_TYPE_NONE ? null : typeKey,
      code: label(typeKey),
      count,
    }))
    .sort((a, b) => b.count - a.count || String(a.code).localeCompare(String(b.code), 'ru'))

  const byTrainerByType = [...trainerTypeMap.entries()]
    .map(([trainerId, typeMap]) => {
      const types = [...typeMap.entries()].map(([typeKey, count]) => ({
        typeId: typeKey === SALES_TRAINING_TYPE_NONE ? null : typeKey,
        code: label(typeKey),
        count,
      }))
      const total = types
        .filter((x) => x.typeId != null)
        .reduce((s, x) => s + x.count, 0)
      return { trainerId, total, byType: types }
    })
    .filter((row) => row.total > 0 || (row.byType ?? []).some((x) => x.count > 0))
    .sort((a, b) => b.total - a.total)

  return { byType, byTrainerByType, totalCounted: sumMatrixRows(rows) }
}

/** @param {unknown} raw */
export function normalizeMatrixRowsFromDb(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .map((row) => ({
      trainer_id: String(row?.trainer_id ?? '').trim(),
      membership_type_id:
        row?.membership_type_id == null || row?.membership_type_id === ''
          ? null
          : String(row.membership_type_id).trim(),
      count: Math.trunc(Number(row?.count) || 0),
    }))
    .filter((row) => row.trainer_id && row.count > 0)
}

/**
 * Id тренеров из ключей матрицы (без __club__), только с count > 0.
 * @param {Record<string, string>|null|undefined} inputMap
 * @returns {string[]}
 */
export function trainerIdsFromTrainingsMatrixInput(inputMap) {
  /** @type {Set<string>} */
  const ids = new Set()
  for (const [key, raw] of Object.entries(inputMap ?? {})) {
    const tid = String(key).split('|')[0] ?? ''
    if (!tid || tid === SALES_TRAINING_CLUB_ID) continue
    if (parseMatrixCellCount(raw) > 0) ids.add(tid)
  }
  return [...ids]
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** @param {unknown} value */
export function isLikelyTrainerUuidLabel(value) {
  return UUID_RE.test(String(value ?? '').trim())
}

/**
 * Нужно ли подтянуть ФИО для id из матрицы (на экране UUID / пусто).
 * @param {Array<{ id?: string, name?: string }>|null|undefined} trainers
 * @param {Record<string, string>|null|undefined} matrix
 */
export function matrixTrainerLabelsNeedEnrich(trainers, matrix) {
  const list = trainers ?? []
  for (const id of trainerIdsFromTrainingsMatrixInput(matrix)) {
    const row = list.find((t) => String(t?.id ?? '').trim() === id)
    const name = String(row?.name ?? row?.email ?? '').trim()
    if (!row || !name || isLikelyTrainerUuidLabel(name)) return true
  }
  return false
}

/**
 * Свести список тренеров + ФИО из каталога, не теряя строки матрицы / месяца.
 * @param {Array<{ id?: string, name?: string, email?: string, club_id?: string|null }>|null|undefined} primary
 * @param {Record<string, string>|null|undefined} matrix
 * @param {Array<{ id?: string, name?: string, email?: string, club_id?: string|null }>|null|undefined} [nameCatalog]
 * @param {Iterable<string>|null|undefined} [extraIds] — id из месяца / stats вне дневной карты
 */
export function mergeTrainersWithMatrixNames(primary, matrix, nameCatalog = [], extraIds = []) {
  /** @type {Map<string, string>} */
  const names = new Map()
  /** @type {Map<string, string|null>} */
  const clubs = new Map()
  for (const t of [...(nameCatalog ?? []), ...(primary ?? [])]) {
    const id = String(t?.id ?? '').trim()
    if (!id) continue
    const n = String(t?.name ?? t?.email ?? '').trim()
    if (n && !isLikelyTrainerUuidLabel(n)) names.set(id, n)
    else if (n && !names.has(id)) names.set(id, n)
    if (t?.club_id != null && String(t.club_id).trim()) {
      clubs.set(id, String(t.club_id).trim())
    }
  }

  /** @type {Map<string, { id: string, name: string, club_id?: string|null }>} */
  const byId = new Map()
  for (const t of primary ?? []) {
    const id = String(t?.id ?? '').trim()
    if (!id) continue
    const nice = names.get(id)
    const rawName = String(t?.name ?? t?.email ?? '').trim()
    byId.set(id, {
      ...t,
      id,
      name: nice || rawName || id,
      club_id: t?.club_id ?? clubs.get(id) ?? null,
    })
  }
  /** @type {Set<string>} */
  const ensureIds = new Set(trainerIdsFromTrainingsMatrixInput(matrix))
  for (const raw of extraIds ?? []) {
    const id = String(raw ?? '').trim()
    if (id) ensureIds.add(id)
  }
  for (const id of ensureIds) {
    const cur = byId.get(id)
    const nice = names.get(id)
    if (!cur) {
      byId.set(id, { id, name: nice || id, club_id: clubs.get(id) ?? null })
      continue
    }
    if (nice && (isLikelyTrainerUuidLabel(cur.name) || !String(cur.name ?? '').trim())) {
      byId.set(id, { ...cur, name: nice })
    }
  }
  return [...byId.values()].sort((a, b) =>
    String(a.name ?? '').localeCompare(String(b.name ?? ''), 'ru'),
  )
}

/**
 * Есть ли в карте/строках детализация по реальным тренерам (формат New).
 * @param {Record<string, string>|null|undefined} inputMap
 * @param {Array<{ trainer_id?: string, count?: number }>|null|undefined} [rows]
 */
export function trainingsMatrixHasTrainerDetail(inputMap, rows) {
  if (Array.isArray(rows)) {
    return rows.some((row) => {
      const tid = String(row?.trainer_id ?? '').trim()
      return tid && tid !== SALES_TRAINING_CLUB_ID && (Number(row?.count) || 0) > 0
    })
  }
  return trainerIdsFromTrainingsMatrixInput(inputMap).length > 0
}

/**
 * Persist: в одном дне либо только __club__, либо только реальные trainer_id (без double).
 * Id тренеров — из списка клуба и из самой матрицы (Excel мог подставить, пока список ещё пуст).
 * @param {Record<string, string>} inputMap
 * @param {string[]} clubTrainerIds
 * @param {Array<{ id: string }>} membershipTypes
 * @returns {{ ok: true, rows: Array<{ trainer_id: string, membership_type_id: string|null, count: number }>, trainerIds: string[] } | { ok: false, error: string }}
 */
export function resolveTrainingsMatrixForPersist(inputMap, clubTrainerIds, membershipTypes) {
  const realIds = (clubTrainerIds ?? []).map((id) => String(id ?? '').trim()).filter(Boolean)
  const useTrainers = trainingsMatrixHasTrainerDetail(inputMap)
  const fromMap = trainerIdsFromTrainingsMatrixInput(inputMap)
  const trainerIds = useTrainers
    ? [...new Set([...realIds, ...fromMap])]
    : [SALES_TRAINING_CLUB_ID]
  const parsed = inputMapToMatrixRows(inputMap, trainerIds, membershipTypes)
  if (!parsed.ok) return parsed
  const rows = useTrainers
    ? parsed.rows.filter((r) => String(r.trainer_id) !== SALES_TRAINING_CLUB_ID)
    : parsed.rows.filter((r) => String(r.trainer_id) === SALES_TRAINING_CLUB_ID)
  return { ok: true, rows, trainerIds }
}

/**
 * Загрузка в форму: ключи из БД как есть (Old = club, New = trainers). Не схлопывать в один club.
 * @param {Array<{ trainer_id?: string, membership_type_id?: string|null, count?: number }>} rows
 */
export function hydrateTrainingsMatrixInputMap(rows) {
  return matrixRowsToInputMap(rows)
}

/**
 * Число в ячейке «По клубу» для UI: из __club__ (Old) или сумма тренеров (New).
 * @param {Record<string, string>} inputMap
 * @param {string[]} trainerIds
 * @param {string} typeId
 */
export function clubDisplayCountForType(inputMap, trainerIds, typeId) {
  const typeKey = typeId === SALES_TRAINING_TYPE_NONE ? null : typeId
  if (!trainingsMatrixHasTrainerDetail(inputMap)) {
    return parseMatrixCellCount(inputMap?.[salesTrainingCellKey(SALES_TRAINING_CLUB_ID, typeKey)])
  }
  const ids = [
    ...new Set([
      ...(trainerIds ?? []).map((id) => String(id ?? '').trim()).filter(Boolean),
      ...trainerIdsFromTrainingsMatrixInput(inputMap),
    ]),
  ]
  let sum = 0
  for (const trainerId of ids) {
    if (!trainerId || trainerId === SALES_TRAINING_CLUB_ID) continue
    sum += parseMatrixCellCount(inputMap?.[salesTrainingCellKey(trainerId, typeKey)])
  }
  return sum
}

/**
 * ЗП персонального зала за день (legacy L1): Old — из «По клубу»; New — из строк тренеров.
 * Полный прогноз (план / надбавка / уровни) — `computeDayPayrollForecastFromInputMap`.
 * @param {Record<string, string>} inputMap
 * @param {Array<{ id: string, trainer_pay_per_session?: number | string }>} membershipTypes
 * @param {string[]} [trainerIds]
 */
export function computeClubTrainingsPayrollFromInputMap(inputMap, membershipTypes, trainerIds = []) {
  const rateMap = buildTrainerPayRateMap(membershipTypes)
  const resolved = resolveTrainingsMatrixForPersist(inputMap, trainerIds, membershipTypes)
  if (!resolved.ok) return 0
  return computePayrollFromMatrixRows(resolved.rows, rateMap).clubTotal
}
