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
 * @param {'no_slot'|'connecting'|'lost'|'no_bpm'|string} reason
 * @returns {string}
 */
export function hrAfterFillUserMessage(reason) {
  if (reason === 'no_slot') return 'Подключите пульсометр'
  if (reason === 'connecting') return 'Пульсометр подключается…'
  if (reason === 'lost' || reason === 'no_bpm') return 'Нет сигнала пульса'
  return 'Не удалось взять пульс'
}
