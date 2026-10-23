/**
 * Короткая строка застрявшей очереди для центра сбоев.
 * Без тела записи: только таблица, действие, имя (если оно уже в строке), попытки и текст отказа.
 */

const MAX_LINES = 5
const MAX_ERROR = 160
const MAX_WHO = 80

const TABLE_LABELS = {
  trainings: 'Тренировка',
  clients: 'Клиент',
  memberships: 'Абонемент',
  health_cards: 'Медкарта',
  body_measurements: 'Замеры',
  client_weight_entries: 'Вес',
  challenges: 'Челлендж',
  exercises: 'Упражнение',
  membership_types: 'Типы абонементов',
  client_plans: 'Задание',
  trainer_schedule_entries: 'Ежедневник',
}

const OP_LABELS = {
  insert: 'создание',
  update: 'изменение',
  delete: 'удаление',
}

function clip(value, max) {
  const text = String(value ?? '').replace(/[\r\n\t]+/g, ' ').trim()
  if (!text) return ''
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`
}

function cleanTable(value) {
  const text = String(value ?? '').trim()
  return /^[a-z_]{1,40}$/.test(text) ? text : ''
}

function whoFrom(data) {
  if (!data || typeof data !== 'object') return ''
  for (const key of ['name', 'full_name', 'client_name']) {
    if (typeof data[key] === 'string' && data[key].trim()) return clip(data[key], MAX_WHO)
  }
  return ''
}

/** Текст для карточки админа. */
export function formatDeviceQueueLine(row) {
  const table = TABLE_LABELS[row?.table] ?? (row?.table || 'Запись')
  const op = OP_LABELS[row?.op] ?? ''
  const parts = [op ? `${table}: ${op}` : table]
  if (row?.who) parts.push(row.who)
  if (Number(row?.retries) > 0) parts.push(`попыток ${row.retries}`)
  if (row?.error) parts.push(row.error)
  return parts.join(' · ')
}

/**
 * Очередь планшета → до 5 строк с отказом или повторными попытками.
 * null — очередь не прочиталась, сервер не должен затирать уже известный текст.
 * @param {Array<object> | null | undefined} queue
 */
export function summarizeDeviceQueue(queue) {
  if (!Array.isArray(queue)) return null
  const ranked = queue
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => String(item?.last_error ?? '').trim() || Number(item?.retry_count) > 0)
    .sort((a, b) => Number(b.item?.retry_count) - Number(a.item?.retry_count) || a.index - b.index)
  return ranked.slice(0, MAX_LINES).map(({ item }) => ({
    table: cleanTable(item?.table_name),
    op: ['insert', 'update', 'delete'].includes(item?.operation) ? item.operation : '',
    retries: Math.min(99, Math.max(0, Math.trunc(Number(item?.retry_count) || 0))),
    error: clip(item?.last_error, MAX_ERROR),
    who: whoFrom(item?.data),
  }))
}

/**
 * Тело отчёта → только разрешённые строки. undefined — поля в отчёте не было.
 * @param {unknown} raw
 */
export function sanitizeDeviceQueueLines(raw) {
  if (raw === undefined) return undefined
  if (!Array.isArray(raw)) return []
  const out = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const clean = {
      table: cleanTable(row.table),
      op: ['insert', 'update', 'delete'].includes(row.op) ? row.op : '',
      retries: Math.min(99, Math.max(0, Math.trunc(Number(row.retries) || 0))),
      error: clip(row.error, MAX_ERROR),
      who: clip(row.who, MAX_WHO),
    }
    if (!clean.table && !clean.error) continue
    out.push({ ...clean, text: formatDeviceQueueLine(clean) })
    if (out.length >= MAX_LINES) break
  }
  return out
}
