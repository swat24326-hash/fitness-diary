/**
 * Отправка рациона PNG: в Max или через системное «Поделиться».
 */

import {
  buildMaxShareUrl,
  normalizeMaxChatUrl,
  normalizePhoneDigits,
  openMaxExternalUrl,
  resolveMaxOpenTarget,
} from '../trainer/trainerClientOutreachCore.js'
import {
  downloadNutritionPlanBlob,
  renderNutritionPlanPng,
  shareNutritionPlanBlob,
} from './nutritionPlanExportCanvas.js'

/**
 * @typedef {'max' | 'other'} NutritionShareChannel
 */

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
  const title = clubName ? `${clubName} · мерный рацион` : 'Мерный рацион'

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

  let shared = false
  try {
    shared = await shareNutritionPlanBlob(blob, title)
  } catch {
    shared = false
  }

  if (channel === 'other') {
    if (!shared) {
      downloadNutritionPlanBlob(blob, `racion-${ctx.client?.id ?? 'client'}.png`)
    }
    return { ok: true, channel, shared, downloaded: !shared, opened: false, openMode: null }
  }

  if (!shared) {
    downloadNutritionPlanBlob(blob, `racion-${ctx.client?.id ?? 'client'}.png`)
  }

  const phone = normalizePhoneDigits(ctx.client?.phone)
  const maxChatUrl = normalizeMaxChatUrl(ctx.client?.max_chat_url)
  const shareText = [title, clientName ? `для ${clientName}` : ''].filter(Boolean).join(' · ')

  let opened = false
  let openMode = null
  if (maxChatUrl || phone) {
    const target = resolveMaxOpenTarget({ message: shareText, phone, maxChatUrl })
    opened = openMaxExternalUrl(target.url)
    openMode = target.mode
  } else {
    opened = openMaxExternalUrl(buildMaxShareUrl(shareText))
    openMode = 'share'
  }

  return {
    ok: true,
    channel,
    shared,
    downloaded: !shared,
    opened,
    openMode,
    phone: phone || null,
    maxChatUrl: maxChatUrl || null,
  }
}
