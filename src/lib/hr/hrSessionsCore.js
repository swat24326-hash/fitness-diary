/** Правила слотов пульса в шапке (без React / BLE). */

export const HR_MAX_SLOTS = 2

/**
 * Фамилию на чипе показываем только когда слотов ≥ 2 (экономия места).
 * @param {number} liveSlotCount
 * @returns {boolean}
 */
export function showHrChipName(liveSlotCount) {
  return Number(liveSlotCount) >= 2
}

/**
 * @param {string | null | undefined} name
 * @returns {string}
 */
export function hrChipSurname(name) {
  const s = String(name ?? '').trim().replace(/\s+/g, ' ')
  if (!s) return 'Клиент'
  return s.split(' ')[0]
}

/**
 * @param {number} currentCount
 * @returns {boolean}
 */
export function canAddHrSlot(currentCount) {
  return Number(currentCount) < HR_MAX_SLOTS
}

/**
 * @param {Array<{ clientId?: string }>} slots
 * @param {string} clientId
 * @returns {boolean}
 */
export function hasHrSlotForClient(slots, clientId) {
  const id = String(clientId ?? '')
  if (!id) return false
  return (slots ?? []).some((s) => String(s?.clientId) === id)
}

/**
 * CSS-модификатор зоны для чипа шапки.
 * @param {'easy'|'mid'|'hard'|string|null|undefined} zone
 */
export function hrChipZoneClass(zone) {
  if (zone === 'easy') return 'app-header__hr-chip--zone-easy'
  if (zone === 'hard') return 'app-header__hr-chip--zone-hard'
  if (zone === 'mid') return 'app-header__hr-chip--zone-mid'
  return ''
}

/**
 * Подсказка перед connect, если не хватает данных для ккал/зон.
 * @param {{ sex?: string|null, weightKg?: number|string|null, birthDate?: string|null }} profile
 * @returns {string}
 */
export function hrConnectProfileHint(profile) {
  const missing = []
  if (!profile?.birthDate) missing.push('дату рождения')
  if (!profile?.sex) missing.push('пол в карте здоровья')
  const w = Number(profile?.weightKg)
  if (!Number.isFinite(w) || w <= 0) missing.push('вес')
  if (missing.length === 0) return ''
  return `Для полной сводки укажите: ${missing.join(', ')}`
}
