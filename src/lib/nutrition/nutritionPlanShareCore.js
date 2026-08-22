/**
 * Отправка рациона PNG: в Max или через системное «Поделиться».
 */

import {
  downloadPngBlob,
  formatTrainerPngShareStatus,
  sendTrainerPngShare,
} from '../trainer/trainerPngShareCore.js'
import { renderNutritionPlanPng } from './nutritionPlanExportCanvas.js'

/** @typedef {'max' | 'other'} NutritionShareChannel */

/**
 * @param {{
 *   client?: { name?: string },
 *   clientName?: string,
 *   clubName?: string,
 * }} ctx
 * @returns {{ shareTitle: string, shareText: string }}
 */
export function buildNutritionPlanShareMessages(ctx = {}) {
  const clientName = String(ctx.clientName ?? ctx.client?.name ?? '').trim()
  const clubName = String(ctx.clubName ?? '').trim()
  const head = clubName ? `${clubName} · мерный рацион` : 'Мерный рацион'
  const who = clientName ? ` для ${clientName}` : ''
  const shareTitle = `${head}${who}`
  const shareText = `${shareTitle}.\n\nОриентировочный рацион на день — см. картинку во вложении.`
  return { shareTitle, shareText }
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
  const { shareTitle, shareText } = buildNutritionPlanShareMessages({ clientName, clubName })

  let blob
  try {
    blob = await renderNutritionPlanPng(plan, {
      clientName,
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
