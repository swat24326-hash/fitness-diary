/**
 * План действия при наличии новой версии PWA.
 * Чистая логика без DOM — verify в scripts/verify-app-stability.mjs.
 */

import {
  shouldAutoApplyPwaUpdate,
  shouldBlockAutoPwaReload,
  shouldHardRecoverPwaUpdate,
} from './appUpdateReloadGuard.js'

/** @typedef {'immediate' | 'prompt' | 'defer'} UpdateDecision */
/**
 * @typedef {'wait_auth' | 'defer' | 'prompt' | 'auto_apply' | 'manual_only' | 'hard_recover' | 'apply'}
 * PwaUpdateAction
 */

/**
 * @param {{
 *   decision?: UpdateDecision | string,
 *   authLoading?: boolean,
 *   guard?: { at: number, attempts: number } | null,
 *   manual?: boolean,
 *   now?: number,
 * }} ctx
 * @returns {PwaUpdateAction}
 */
export function planPwaUpdateAction(ctx = {}) {
  const decision = String(ctx.decision ?? 'prompt')
  const now = ctx.now ?? Date.now()
  const guard = ctx.guard ?? null
  const manual = ctx.manual === true

  if (manual && shouldHardRecoverPwaUpdate(guard, now)) return 'hard_recover'
  if (manual) return 'apply'

  if (decision === 'defer') return 'defer'
  if (ctx.authLoading === true) return 'wait_auth'
  if (decision === 'prompt') return 'prompt'

  if (
    shouldAutoApplyPwaUpdate({
      decision,
      authLoading: false,
      guard,
      now,
    })
  ) {
    return 'auto_apply'
  }

  if (decision === 'immediate' && shouldBlockAutoPwaReload(guard, now)) {
    return 'manual_only'
  }

  return 'manual_only'
}

/**
 * Текст баннера (русский) по ситуации.
 * @param {{
 *   action?: PwaUpdateAction,
 *   salesDraftBlocks?: boolean,
 *   offline?: boolean,
 * }} ctx
 */
export function pwaUpdateBannerCopy(ctx = {}) {
  if (ctx.salesDraftBlocks) {
    return {
      text: 'Доступна новая версия. На экране отчёта есть несохранённый черновик (часто «хвост» плана в телефоне). Сохраните план или сбросьте черновик — тогда можно обновить.',
      primary: 'Сбросить черновик и обновить',
      secondary: 'Позже',
    }
  }
  if (ctx.action === 'defer') {
    return {
      text: 'Доступна новая версия — обновим, когда закончите тренировку или сохраните отчёт продаж.',
      primary: null,
      secondary: 'Понятно',
    }
  }
  if (ctx.action === 'manual_only' || ctx.action === 'hard_recover') {
    return {
      text: 'Обновление прервалось на этом устройстве. Нажмите «Обновить ещё раз» — подтянем новую версию без цикла входа.',
      primary: 'Обновить ещё раз',
      secondary: 'Позже',
    }
  }
  let text = 'Доступна новая версия. Нажмите один раз — всё обновится само.'
  if (ctx.offline) {
    text += ' Сейчас офлайн — обновление применится при появлении интернета.'
  }
  return {
    text,
    primary: 'Обновить сейчас',
    secondary: 'Позже',
  }
}
