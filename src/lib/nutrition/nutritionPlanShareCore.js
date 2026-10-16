/**
 * Отправка рациона PNG: в Max или через системное «Поделиться».
 */

import {
  downloadPngBlob,
  formatTrainerPngShareStatus,
  sendTrainerPngShare,
} from '../trainer/trainerPngShareCore.js'
import { resolveClientGreetingName } from '../trainer/trainerClientOutreachCore.js'
import { renderNutritionPlanPng } from './nutritionPlanExportCanvas.js'

/** @typedef {'max' | 'other'} NutritionShareChannel */

/**
 * @param {{
 *   client?: { name?: string },
 *   clientName?: string,
 *   clubName?: string,
 *   daysCount?: number,
 * }} ctx
 * @returns {{ shareTitle: string, shareText: string }}
 */
export function buildNutritionPlanShareMessages(ctx = {}) {
  const greeting = resolveClientGreetingName(ctx.client ?? ctx.clientName, ctx.outreachName)
  const clubName = String(ctx.clubName ?? '').trim()
  const daysCount = Number(ctx.daysCount) > 1 ? Number(ctx.daysCount) : 1
  const head = clubName ? `${clubName} · мерный рацион` : 'Мерный рацион'
  const who = greeting ? ` для ${greeting}` : ''
  const shareTitle = `${head}${who}`
  const shareText =
    daysCount > 1
      ? `${shareTitle}.\n\nРацион на ${daysCount} дн. — меню по дням на картинке. Граммы и рецепты — в приложении.`
      : `${shareTitle}.\n\nОриентировочный рацион на день — на картинке.`
  return { shareTitle, shareText, clientLabel: greeting || String(ctx.clientName ?? ctx.client?.name ?? '').trim() }
}

/** @deprecated используйте buildNutritionPlanShareMessages */
export function buildNutritionPlanShareText(ctx = {}) {
  return buildNutritionPlanShareMessages(ctx).shareTitle
}

/**
 * @param {object} plan
 * @param {{
 *   client?: { name?: string, phone?: string | null, max_chat_url?: string | null, id?: string },
 *   clientName?: string,
 *   clubName?: string,
 *   goalKindLabel?: string,
 *   weightKg?: number | string | null,
 * }} ctx
 * @param {{ channel?: NutritionShareChannel }} [opts]
 */
export async function sendNutritionPlanPng(plan, ctx = {}, opts = {}) {
  if (!plan) return { ok: false, error: 'empty_plan' }

  const channel = opts.channel === 'other' ? 'other' : 'max'
  const clientName = String(ctx.clientName ?? ctx.client?.name ?? '').trim()
  const clubName = String(ctx.clubName ?? '').trim()
  const daysCount =
    Array.isArray(plan.days) && plan.days.length > 1 ? plan.days.length : Number(plan.daysCount) || 1
  const { shareTitle, shareText, clientLabel } = buildNutritionPlanShareMessages({
    client: ctx.client,
    clientName,
    clubName,
    outreachName: ctx.client?.outreach_name,
    daysCount,
  })

  let blob
  try {
    blob = await renderNutritionPlanPng(plan, {
      clientName: clientLabel || clientName,
      goalKindLabel: ctx.goalKindLabel,
      weightKg: ctx.weightKg,
    })
  } catch (e) {
    return { ok: false, error: 'png_failed', detail: String(e?.message ?? e) }
  }

  const result = await sendTrainerPngShare({
    blob,
    filename: `racion-${ctx.client?.id ?? 'client'}.png`,
    title: shareTitle,
    text: shareText,
    channel,
    client: ctx.client,
  })

  return { ...result, statusText: formatTrainerPngShareStatus(result) }
}

export { downloadPngBlob as downloadNutritionPlanBlob, formatTrainerPngShareStatus }
