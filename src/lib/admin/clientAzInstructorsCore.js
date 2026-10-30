/**
 * Связь клиент АЗ ↔ инструктор(ы) по направлению.
 * Не трогает clients.trainer_id (только ПЗ). Без React / IDB.
 */

export const CLIENT_AZ_INSTRUCTORS_TABLE = 'client_az_instructors'
export const CLIENT_AZ_INSTRUCTORS_MAX_PER_CLIENT = 20

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/

/** @param {unknown} raw */
export function isClientAzInstructorUuid(raw) {
  return UUID_RE.test(String(raw ?? '').trim())
}

/**
 * @param {unknown} raw
 * @returns {{ ok: true, data: object } | { ok: false, error: string }}
 */
export function normalizeClientAzInstructorRow(raw) {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Нет данных инструктора АЗ' }
  const id = String(raw.id ?? '').trim()
  const client_id = String(raw.client_id ?? '').trim()
  const club_id = String(raw.club_id ?? '').trim()
  const instructor_id = String(raw.instructor_id ?? '').trim()
  const direction_type_id = String(raw.direction_type_id ?? '').trim()
  if (!isClientAzInstructorUuid(id)) return { ok: false, error: 'Некорректный id связи' }
  if (!isClientAzInstructorUuid(client_id)) return { ok: false, error: 'Некорректный клиент' }
  if (!isClientAzInstructorUuid(club_id)) return { ok: false, error: 'Некорректный клуб' }
  if (!isClientAzInstructorUuid(instructor_id)) return { ok: false, error: 'Выберите инструктора' }
  if (!isClientAzInstructorUuid(direction_type_id)) {
    return { ok: false, error: 'Выберите направление (Бокс / Степ…)' }
  }
  const updated_at = String(raw.updated_at ?? '').trim() || new Date().toISOString()
  return {
    ok: true,
    data: { id, client_id, club_id, instructor_id, direction_type_id, updated_at },
  }
}

/**
 * @param {{
 *   clientId: unknown,
 *   clubId: unknown,
 *   instructorId: unknown,
 *   directionTypeId: unknown,
 *   id?: unknown,
 * }} input
 */
export function buildClientAzInstructorRow(input) {
  const id = String(input?.id ?? '').trim() || cryptoRandomUuidFallback()
  return normalizeClientAzInstructorRow({
    id,
    client_id: input?.clientId,
    club_id: input?.clubId,
    instructor_id: input?.instructorId,
    direction_type_id: input?.directionTypeId,
    updated_at: new Date().toISOString(),
  })
}

function cryptoRandomUuidFallback() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return '00000000-0000-4000-8000-000000000000'
}

/**
 * Дубликат: тот же клиент + инструктор + направление.
 * @param {object[]} existing
 * @param {{ client_id: string, instructor_id: string, direction_type_id: string, id?: string }} row
 */
export function findDuplicateClientAzInstructor(existing, row) {
  const cid = String(row?.client_id ?? '')
  const iid = String(row?.instructor_id ?? '')
  const did = String(row?.direction_type_id ?? '')
  const exclude = String(row?.id ?? '')
  for (const r of existing ?? []) {
    if (exclude && String(r?.id ?? '') === exclude) continue
    if (
      String(r?.client_id ?? '') === cid &&
      String(r?.instructor_id ?? '') === iid &&
      String(r?.direction_type_id ?? '') === did
    ) {
      return r
    }
  }
  return null
}

/**
 * @param {{
 *   client?: { id?: unknown, club_id?: unknown, trainer_id?: unknown, desk_hall?: unknown } | null,
 *   row: object,
 *   existingRows?: object[],
 *   azTypeIds?: Iterable<string> | null,
 * }} input
 * @returns {{ ok: true, data: object } | { ok: false, error: string }}
 */
export function validateClientAzInstructorAssign(input) {
  const prep = normalizeClientAzInstructorRow(input?.row)
  if (!prep.ok) return prep
  const data = prep.data
  const client = input?.client
  if (client) {
    const clientId = String(client.id ?? '').trim()
    if (clientId && clientId !== data.client_id) {
      return { ok: false, error: 'Клиент не совпадает со связью' }
    }
    const clubId = String(client.club_id ?? '').trim()
    if (clubId && clubId !== data.club_id) {
      return { ok: false, error: 'Клуб клиента не совпадает' }
    }
  }
  const existing = input?.existingRows ?? []
  if (existing.length >= CLIENT_AZ_INSTRUCTORS_MAX_PER_CLIENT) {
    const sameId = existing.some((r) => String(r?.id ?? '') === data.id)
    if (!sameId) {
      return {
        ok: false,
        error: `Не больше ${CLIENT_AZ_INSTRUCTORS_MAX_PER_CLIENT} инструкторов на клиента`,
      }
    }
  }
  if (findDuplicateClientAzInstructor(existing, data)) {
    return { ok: false, error: 'Этот инструктор уже назначен на это направление' }
  }
  if (input?.azTypeIds) {
    const allowed = new Set([...input.azTypeIds].map((x) => String(x ?? '').trim()).filter(Boolean))
    if (allowed.size && !allowed.has(data.direction_type_id)) {
      return { ok: false, error: 'Направление не из списка АЗ клуба' }
    }
  }
  return { ok: true, data }
}

/**
 * Назначение инструктора АЗ никогда не должно писать в trainer_id.
 * @param {object | null | undefined} clientPatch
 */
export function assertAzInstructorAssignKeepsTrainerIdUntouched(clientPatch) {
  if (!clientPatch || typeof clientPatch !== 'object') return { ok: true }
  if (Object.prototype.hasOwnProperty.call(clientPatch, 'trainer_id')) {
    return {
      ok: false,
      error: 'Инструктор АЗ не пишется в «Тренер ПЗ» (trainer_id)',
    }
  }
  return { ok: true }
}

/**
 * @param {{ instructorName?: unknown, directionName?: unknown }} p
 */
export function formatClientAzInstructorLabel(p) {
  const dir = String(p?.directionName ?? '').trim()
  const name = String(p?.instructorName ?? '').trim() || 'Инструктор'
  if (dir) return `${dir} · ${name}`
  return name
}

/**
 * @param {object[]} rows
 * @param {string} clientId
 */
export function filterClientAzInstructorsByClient(rows, clientId) {
  const cid = String(clientId ?? '').trim()
  if (!cid) return []
  return (rows ?? []).filter((r) => String(r?.client_id ?? '') === cid)
}
