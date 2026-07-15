/**
 * Отправка ДЗ: PNG + Max или системное «Поделиться» (другой мессенджер).
 */

import {
  buildMaxShareUrl,
  normalizeMaxChatUrl,
  normalizePhoneDigits,
  openMaxExternalUrl,
  resolveMaxOpenTarget,
} from '../trainer/trainerClientOutreachCore.js'
import { downloadHomeworkPlanBlob, renderHomeworkPlanPng, shareHomeworkPlanBlob } from './homeworkPlanExportCanvas.js'
import { isHomeworkDraftReady } from './homeworkPlanCore.js'

/**
 * @typedef {'max' | 'other'} HomeworkShareChannel
 */

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

  let blob
  try {
    blob = await renderHomeworkPlanPng(draft, { clientName, trainerName, clubName })
  } catch (e) {
    return { ok: false, error: 'png_failed', detail: String(e?.message ?? e) }
  }

  const title = clubName ? `${clubName} · ${draft.title || 'Домашнее задание'}` : draft.title || 'Домашнее задание'
  const shareText = [
    clubName ? `Домашнее задание · ${clubName}` : 'Домашнее задание',
    draft.title || 'ДЗ',
    clientName ? `для ${clientName}` : '',
    trainerName ? `тренер ${trainerName}` : '',
  ]
    .filter(Boolean)
    .join(' · ')

  let shared = false
  try {
    shared = await shareHomeworkPlanBlob(blob, title)
  } catch {
    shared = false
  }

  if (channel === 'other') {
    if (!shared) {
      downloadHomeworkPlanBlob(blob, 'homework.png')
    }
    return {
      ok: true,
      channel,
      shared,
      downloaded: !shared,
      opened: false,
      openMode: null,
    }
  }

  // Max: файл в «Поделиться» (если есть) + открыть Max
  if (!shared) {
    downloadHomeworkPlanBlob(blob, 'homework.png')
  }

  const phone = normalizePhoneDigits(ctx.client?.phone)
  const maxChatUrl = normalizeMaxChatUrl(ctx.client?.max_chat_url)
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
