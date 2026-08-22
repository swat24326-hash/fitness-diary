/**
 * Отправка ДЗ: PNG + Max или системное «Поделиться» (другой мессенджер).
 */

import {
  formatTrainerPngShareStatus,
  sendTrainerPngShare,
} from '../trainer/trainerPngShareCore.js'
import { renderHomeworkPlanPng } from './homeworkPlanExportCanvas.js'
import { isHomeworkDraftReady } from './homeworkPlanCore.js'

/** @typedef {'max' | 'other'} HomeworkShareChannel */

/**
 * @param {{
 *   draft: import('./homeworkPlanCore.js').HomeworkDraft,
 *   clientName?: string,
 *   trainerName?: string,
 *   clubName?: string,
 * }} ctx
 * @returns {{ shareTitle: string, shareText: string }}
 */
export function buildHomeworkShareMessages(ctx = {}) {
  const draft = ctx.draft ?? {}
  const clientName = String(ctx.clientName ?? '').trim()
  const trainerName = String(ctx.trainerName ?? '').trim()
  const clubName = String(ctx.clubName ?? '').trim()
  const dzTitle = String(draft.title ?? '').trim() || 'Домашнее задание'

  const shareTitle = clubName ? `${clubName} · ${dzTitle}` : dzTitle
  const shareText = [
    clubName ? `Домашнее задание · ${clubName}` : 'Домашнее задание',
    dzTitle !== 'Домашнее задание' ? dzTitle : '',
    clientName ? `для ${clientName}` : '',
    trainerName ? `тренер ${trainerName}` : '',
  ]
    .filter(Boolean)
    .join(' · ')

  return {
    shareTitle,
    shareText: `${shareText}.\n\nУпражнения и подходы — на картинке во вложении.`,
  }
}

/**
 * @param {import('./homeworkPlanCore.js').HomeworkDraft} draft
 * @param {{
 *   client?: { name?: string, phone?: string | null, max_chat_url?: string | null },
 *   trainerName?: string,
 *   clientName?: string,
 *   clubName?: string,
 * }} ctx
 * @param {{ channel?: HomeworkShareChannel }} [opts]
 */
export async function sendHomeworkDraft(draft, ctx = {}, opts = {}) {
  if (!isHomeworkDraftReady(draft)) {
    return { ok: false, error: 'empty_draft' }
  }

  const channel = opts.channel === 'other' ? 'other' : 'max'
  const clientName = String(ctx.clientName ?? ctx.client?.name ?? '').trim()
  const trainerName = String(ctx.trainerName ?? '').trim()
  const clubName = String(ctx.clubName ?? '').trim()
  const { shareTitle, shareText } = buildHomeworkShareMessages({ draft, clientName, trainerName, clubName })

  let blob
  try {
    blob = await renderHomeworkPlanPng(draft, { clientName, trainerName, clubName })
  } catch (e) {
    return { ok: false, error: 'png_failed', detail: String(e?.message ?? e) }
  }

  const result = await sendTrainerPngShare({
    blob,
    filename: 'homework.png',
    title: shareTitle,
    text: shareText,
    channel,
    client: ctx.client,
  })

  return { ...result, statusText: formatTrainerPngShareStatus(result) }
}

export { formatTrainerPngShareStatus }
