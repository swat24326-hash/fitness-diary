/**
 * Размещение боковых карточек ряда «внимание» на главной.
 * План всегда слева. Слоты: ПНК | планёрка/звонки.
 *
 * Критические ситуации (менеджер, enableCallToday):
 *
 * | ПНК | Планёрка | Очередь звонков | Результат |
 * |-----|----------|----------------|-----------|
 * | −   | −        | любая          | звонки справа (пустая = подсказка) |
 * | +   | −        | любая          | ПНК + звонки |
 * | −   | +        | любая          | звонки в слот ПНК, планёрка справа |
 * | +   | +        | есть люди      | ПНК + звонки (планёрка → плитка) |
 * | +   | +        | пусто          | ПНК + планёрка (не вытеснять пустой карточкой) |
 *
 * Админ без enableCallToday: только ПНК / планёрка / soft.
 */

/**
 * Вытеснять планёрку звонками только если в очереди есть кому звонить.
 * Пустая «подсказка» не должна прятать срочное задание планёрки.
 *
 * @param {{ enableCallToday?: boolean, hasCallQueue?: boolean }} opts
 */
export function shouldDisplacePlanerkaForCallToday(opts = {}) {
  return Boolean(opts.enableCallToday && opts.hasCallQueue)
}

/**
 * @param {{
 *   hasPnk?: boolean,
 *   hasPlanerka?: boolean,
 *   enableCallToday?: boolean,
 *   hasCallQueue?: boolean,
 *   callTodayReady?: boolean,
 *   preferCallTodayOverPlanerka?: boolean,
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
  const wantCall = Boolean(opts.enableCallToday)
  const preferCall =
    opts.preferCallTodayOverPlanerka != null
      ? Boolean(opts.preferCallTodayOverPlanerka)
      : shouldDisplacePlanerkaForCallToday({
          enableCallToday: wantCall,
          hasCallQueue: opts.hasCallQueue,
        })

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
      pnk = 'callToday'
      callTodaySlot = 'pnk'
    } else if (preferCall) {
      planerka = 'callToday'
      callTodaySlot = 'planerka'
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
