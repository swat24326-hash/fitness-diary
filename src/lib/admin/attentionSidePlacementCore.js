/**
 * Размещение боковых карточек ряда «внимание» на главной.
 * План всегда слева. Слоты: ПНК | планёрка.
 *
 * Приоритет в слоте планёрки: планёрка > «кому звонить» > soft
 * Приоритет в слоте ПНК: ПНК > «кому звонить» (если планёрка заняла правый слот) > soft
 * Если оба слота заняты первичными (ПНК + планёрка) — «кому звонить» скрыт (не ломаем сетку).
 */

/**
 * @param {{
 *   hasPnk?: boolean,
 *   hasPlanerka?: boolean,
 *   enableCallToday?: boolean,
 *   callTodayReady?: boolean,
 * }} opts
 * @returns {{
 *   pnk: 'pnk' | 'callToday' | 'empty',
 *   planerka: 'planerka' | 'callToday' | 'empty',
 *   callTodayShown: boolean,
 *   callTodaySlot: 'pnk' | 'planerka' | null,
 * }}
 */
export function resolveAttentionSidePlacement(opts = {}) {
  const hasPnk = Boolean(opts.hasPnk)
  const hasPlanerka = Boolean(opts.hasPlanerka)
  const wantCall = Boolean(opts.enableCallToday && opts.callTodayReady)

  /** @type {'pnk' | 'callToday' | 'empty'} */
  let pnk = hasPnk ? 'pnk' : 'empty'
  /** @type {'planerka' | 'callToday' | 'empty'} */
  let planerka = hasPlanerka ? 'planerka' : 'empty'

  /** @type {'pnk' | 'planerka' | null} */
  let callTodaySlot = null

  if (wantCall) {
    if (planerka === 'empty') {
      planerka = 'callToday'
      callTodaySlot = 'planerka'
    } else if (pnk === 'empty') {
      // Планёрка заняла правый слот — не оставляем дыру слева
      pnk = 'callToday'
      callTodaySlot = 'pnk'
    }
  }

  return {
    pnk,
    planerka,
    callTodayShown: callTodaySlot != null,
    callTodaySlot,
  }
}

/**
 * Что считать «занятым» для soft-сигналов (чтобы не класть soft поверх callToday).
 * @param {ReturnType<typeof resolveAttentionSidePlacement>} placement
 */
export function attentionSoftOccupancy(placement) {
  return {
    hasPnk: placement.pnk === 'pnk' || placement.pnk === 'callToday',
    hasPlanerka: placement.planerka === 'planerka' || placement.planerka === 'callToday',
  }
}
