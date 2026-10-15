/**
 * Ежедневник: дошёл ли перенос до сервера. Напоминания тренеру и клиенту шлёт сервер по своей копии записи —
 * пока планшет не отправил изменение, они придут по старому времени.
 */

export const SCHEDULE_DELIVERY_WAIT_MS = 8000

/** @typedef {'sending' | 'sent' | 'pending' | 'offline'} ScheduleDelivery */

/** Запись есть только на устройстве (ещё не подтверждена сервером). @param {object | null | undefined} entry */
export function isScheduleEntryUnsent(entry) {
  return entry?.synced === false
}

export const SCHEDULE_UNSENT_TITLE = 'Не отправлено на сервер — напоминание придёт по старому времени'

/**
 * Плашка после переноса. `sent` — без оговорок; `pending` / `offline` — предупреждение про напоминание.
 * @param {string} when «Чт 16.10, 17:00»
 * @param {ScheduleDelivery} delivery
 * @returns {{ text: string, tone: 'info' | 'warn' }}
 */
export function scheduleMoveNotice(when, delivery) {
  if (delivery === 'sending') return { text: `Перенесено на ${when} · отправляем…`, tone: 'info' }
  if (delivery === 'offline') {
    return {
      text: `Нет связи: перенесено на ${when} только на планшете. Напоминание придёт по старому времени, пока планшет не отправит изменение`,
      tone: 'warn',
    }
  }
  if (delivery === 'pending') {
    return {
      text: `Перенесено на ${when}, но сервер пока не получил изменение — напоминание может прийти по старому времени. Нажмите «Синхронизировать»`,
      tone: 'warn',
    }
  }
  return { text: `Перенесено на ${when} · напоминание тоже`, tone: 'info' }
}
