/**
 * Правки библиотеки ДЗ админом (таблица homework_library, одна на сеть).
 * Встроенные упражнения живут в коде (HOMEWORK_LIBRARY); строка в таблице с тем же id — правка,
 * с новым id — своё упражнение, is_active: false — убрано из подбора (можно вернуть).
 * Итоговая библиотека = встроенная + правки — её берут генератор на планшете и cron на сервере.
 */
import { isUuid } from '../../stableUuid.js'
import { HOMEWORK_LIBRARY, validateHomeworkLibraryEntry } from './homeworkLibrary.js'

const ENTRY_FIELDS = ['name', 'pattern', 'level', 'equip', 'household', 'alt', 'unit', 'phases', 'side', 'impact', 'avoid', 'goals', 'focus', 'how', 'cue']
const ID_RE = /^[a-z0-9_]{1,64}$/

const text = (v) => String(v ?? '').trim()

/** Только поля упражнения, без мусора; пустые необязательные — убираем. */
export function pickHomeworkLibraryEntry(raw, id) {
  const src = raw && typeof raw === 'object' ? raw : {}
  const e = { id }
  for (const f of ENTRY_FIELDS) {
    const v = src[f]
    if (v === undefined || v === null || v === '' || v === false) continue
    if (Array.isArray(v)) e[f] = [...new Set(v.map(String))]
    else if (typeof v === 'string') e[f] = v.trim()
    else e[f] = v
  }
  if (e.level !== undefined) e.level = Number(e.level)
  if (e.phases && !e.phases.length) delete e.phases
  e.avoid = e.avoid ?? []
  e.goals = e.goals ?? []
  return e
}

/**
 * Строка очереди → колонки homework_library. Упражнение проверяется теми же правилами, что встроенные.
 * @returns {{ ok: true, data: object } | { ok: false, error: string }}
 */
export function normalizeHomeworkLibraryRow(raw) {
  const id = text(raw?.id)
  if (!ID_RE.test(id)) return { ok: false, error: 'Некорректный id упражнения' }
  const active = raw?.is_active !== false
  const entry = pickHomeworkLibraryEntry(raw?.entry, id)
  if (active) {
    const errors = validateHomeworkLibraryEntry(entry)
    if (errors.length) return { ok: false, error: `Упражнение заполнено не полностью: ${errors[0]}` }
  }
  return {
    ok: true,
    data: {
      id,
      entry,
      is_active: active,
      updated_by: isUuid(raw?.updated_by) ? String(raw.updated_by) : null,
      updated_at: text(raw?.updated_at) || new Date().toISOString(),
    },
  }
}

/** Право записи: только админ сети; удаление — через is_active (встроенные из кода не стереть). */
export function assertHomeworkLibraryPush({ op, isAdmin, userId, payload, remoteId }) {
  if (!isAdmin) return { ok: false, error: 'Библиотеку ДЗ меняет только администратор' }
  if (op === 'delete') return { ok: false, error: 'Упражнение убирают из подбора, а не удаляют' }
  if (remoteId && String(remoteId) !== text(payload?.id)) return { ok: false, error: 'Некорректный id упражнения' }
  if (text(payload?.updated_by) !== String(userId)) return { ok: false, error: 'Изменения должны быть от вашего имени' }
  return { ok: true }
}

/**
 * Итоговая библиотека: встроенные + правки. Битые строки пропускаем — генератор не должен падать.
 * @param {object[]} rows — строки homework_library
 * @param {object[]} [base]
 */
export function mergeHomeworkLibrary(rows, base = HOMEWORK_LIBRARY) {
  const byId = new Map(base.map((e) => [e.id, e]))
  for (const raw of rows ?? []) {
    const r = normalizeHomeworkLibraryRow(raw)
    if (!r.ok) continue
    if (r.data.is_active) byId.set(r.data.id, r.data.entry)
    else byId.delete(r.data.id)
  }
  return [...byId.values()]
}

/**
 * Список для админа: все упражнения, включая убранные, с пометкой откуда.
 * status: 'base' — как в коде, 'edited' — встроенное с правкой, 'custom' — своё, 'removed' — убрано из подбора.
 */
export function homeworkLibraryAdminList(rows, base = HOMEWORK_LIBRARY) {
  const baseById = new Map(base.map((e) => [e.id, e]))
  const byId = new Map(base.map((e) => [e.id, { entry: e, status: 'base' }]))
  for (const raw of rows ?? []) {
    const r = normalizeHomeworkLibraryRow(raw)
    if (!r.ok) continue
    const orig = baseById.get(r.data.id)
    const entry = r.data.is_active || !orig || r.data.entry.name ? r.data.entry : orig
    let status = 'custom'
    if (!r.data.is_active) status = 'removed'
    else if (orig) status = sameHomeworkEntry(orig, r.data.entry) ? 'base' : 'edited'
    byId.set(r.data.id, { entry, status })
  }
  return [...byId.values()].sort((a, b) => String(a.entry.name ?? '').localeCompare(String(b.entry.name ?? ''), 'ru'))
}

/** Правка совпадает с исходником из кода — «Вернуть как было» без удаления строки. */
export function sameHomeworkEntry(a, b) {
  return JSON.stringify(pickHomeworkLibraryEntry(a, a?.id)) === JSON.stringify(pickHomeworkLibraryEntry(b, a?.id))
}

/** Встроенное упражнение из кода (для «Вернуть как было»). */
export function baseHomeworkEntry(id, base = HOMEWORK_LIBRARY) {
  return base.find((e) => e.id === id) ?? null
}

/** id нового упражнения: c_ + 8 случайных символов (a-z0-9). */
export function newHomeworkLibraryId(random = Math.random) {
  let s = 'c_'
  for (let i = 0; i < 8; i++) s += '0123456789abcdefghijklmnopqrstuvwxyz'[Math.floor(random() * 36)]
  return s
}

/** Замены для гантелей: то же движение, без гантелей, не добавляет клиенту ограничений (как validateHomeworkLibraryAlts). */
export function homeworkLibraryAltOptions(library, pattern, avoid = null) {
  return (library ?? []).filter(
    (e) => e.pattern === pattern && e.equip !== 'dumbbells' && (!avoid || e.avoid.every((a) => avoid.includes(a))),
  )
}
