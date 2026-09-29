/**
 * Подстановка hr_after из живого слота пульса (двойной тап по ячейке).
 * Без React / BLE.
 */

/** Окно двойного тапа на планшете, мс. */
export const HR_AFTER_DOUBLE_TAP_MS = 350

/**
 * @param {{ bpm?: number|null, status?: string } | null | undefined} slot
 * @returns {{ ok: true, value: string } | { ok: false, reason: 'no_slot'|'connecting'|'lost'|'no_bpm' }}
 */
export function hrAfterFromLiveSlot(slot) {
  if (!slot || typeof slot !== 'object') {
    return { ok: false, reason: 'no_slot' }
  }
  const bpm = Number(slot.bpm)
  if (Number.isFinite(bpm) && bpm > 0 && bpm <= 300) {
    return { ok: true, value: String(Math.round(bpm)) }
  }
  const status = String(slot.status ?? '')
  if (status === 'connecting') return { ok: false, reason: 'connecting' }
  if (status === 'lost') return { ok: false, reason: 'lost' }
  return { ok: false, reason: 'no_bpm' }
}

/**
 * Успешная подстановка: onChange + blur (клавиатура не должна висеть рядом с секундомером).
 * @param {{ bpm?: number|null, status?: string } | null | undefined} slot
 * @param {{ onChange?: (v: string) => void, blur?: () => void }} handlers
 * @returns {{ filled: true, value: string, blurred: boolean } | { filled: false, reason: string, blurred: false }}
 */
export function applyHrAfterFillFromLive(slot, handlers = {}) {
  const result = hrAfterFromLiveSlot(slot)
  if (!result.ok) {
    return { filled: false, reason: result.reason, blurred: false }
  }
  if (typeof handlers.onChange === 'function') handlers.onChange(result.value)
  let blurred = false
  if (typeof handlers.blur === 'function') {
    handlers.blur()
    blurred = true
  }
  return { filled: true, value: result.value, blurred }
}

/**
 * @param {'no_slot'|'connecting'|'lost'|'no_bpm'|string} reason
 * @returns {string}
 */
export function hrAfterFillUserMessage(reason) {
  if (reason === 'no_slot') return 'Подключите пульсометр'
  if (reason === 'connecting') return 'Пульсометр подключается…'
  if (reason === 'lost' || reason === 'no_bpm') return 'Нет сигнала пульса'
  return 'Не удалось взять пульс'
}
