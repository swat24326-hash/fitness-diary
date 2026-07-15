/**
 * Отправка ДЗ: PNG + открытие Max (ссылка чата или окно share).
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
 * @param {import('./homeworkPlanCore.js').HomeworkDraft} draft
 * @param {{
 *   client?: { name?: string, phone?: string | null, max_chat_url?: string | null, club_id?: string },
 *   trainerName?: string,
 *   clientName?: string,
 *   clubName?: string,
 * }} ctx
 */
export async function sendHomeworkDraft(draft, ctx = {}) {
  if (!isHomeworkDraftReady(draft)) {
    return { ok: false, error: 'empty_draft' }
  }

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
  let shared = false
  try {
    shared = await shareHomeworkPlanBlob(blob, title)
  } catch {
    shared = false
  }
  if (!shared) {
    downloadHomeworkPlanBlob(blob, 'homework.png')
  }

  const phone = normalizePhoneDigits(ctx.client?.phone)
  const maxChatUrl = normalizeMaxChatUrl(ctx.client?.max_chat_url)
  const shareText = [
    clubName ? `Домашнее задание · ${clubName}` : 'Домашнее задание',
    draft.title || 'ДЗ',
    clientName ? `для ${clientName}` : '',
    trainerName ? `тренер ${trainerName}` : '',
  ]
    .filter(Boolean)
    .join(' · ')

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
    shared,
    downloaded: !shared,
    opened,
    openMode,
    phone: phone || null,
    maxChatUrl: maxChatUrl || null,
  }
}
