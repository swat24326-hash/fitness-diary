/**
 * Сообщения клиенту ПНК: «В Max» / «Другой мессенджер» (как ДЗ).
 */
import {
  buildMaxShareUrl,
  copyTextToClipboard,
  normalizeMaxChatUrl,
  normalizePhoneDigits,
  openMaxExternalUrl,
  resolveClientGreetingName,
  resolveMaxOpenTarget,
} from '../trainer/trainerClientOutreachCore.js'
import { formatDateRu } from '../dateRu.js'

/** @typedef {'invite' | 'followup'} PnkClientMessageKind */
/** @typedef {'max' | 'other'} PnkClientNotifyChannel */

/**
 * @param {PnkClientMessageKind} kind
 * @param {{
 *   client?: { name?: string, outreach_name?: string | null, phone?: string | null, pnk_trial_date?: string | null, pnk_trial_time?: string | null },
 *   trainerName?: string,
 *   clubName?: string,
 *   trialDate?: string | null,
 *   trialTime?: string | null,
 * }} ctx
 */
export function buildPnkClientMessage(kind, ctx = {}) {
  const greeting = resolveClientGreetingName(ctx.client) || 'Здравствуйте'
  const trainerName = String(ctx.trainerName ?? '').trim()
  const clubName = String(ctx.clubName ?? '').trim() || 'FIT-CITY'
  const trialDate = String(ctx.trialDate ?? ctx.client?.pnk_trial_date ?? '').slice(0, 10)
  const trialTime = String(ctx.trialTime ?? ctx.client?.pnk_trial_time ?? '').trim()
  const when = trialDate
    ? `${formatDateRu(trialDate)}${trialTime ? ` в ${trialTime}` : ''}`
    : ''

  if (kind === 'followup') {
    return [
      `${greeting}!`,
      `Это ${trainerName || 'ваш тренер'} · ${clubName}.`,
      'Как самочувствие после бесплатной тренировки?',
      'Готовы обсудить абонемент или остались вопросы?',
      'Напишите, когда удобно созвониться.',
    ].join('\n')
  }

  // invite
  const lines = [
    `${greeting}!`,
    `Это ${trainerName || 'тренер'} · ${clubName}.`,
    'Приглашаю на бесплатную тренировку.',
  ]
  if (when) {
    lines.push(`Предлагаю: ${when}.`)
    lines.push('Если время не подходит — напишите, подберём другое.')
  } else {
    lines.push('Напишите удобный день и время — зафиксируем в клубе.')
  }
  return lines.join('\n')
}

/**
 * @param {string} message
 * @param {{
 *   channel?: PnkClientNotifyChannel,
 *   clientPhone?: string | null,
 *   clientMaxChatUrl?: string | null,
 *   title?: string,
 * }} [opts]
 */
export async function notifyPnkClient(message, opts = {}) {
  const text = String(message ?? '').trim()
  if (!text) return { ok: false, error: 'empty' }

  const channel = opts.channel === 'other' ? 'other' : 'max'

  let copied = false
  try {
    await copyTextToClipboard(text)
    copied = true
  } catch {
    copied = false
  }

  if (channel === 'other') {
    let shared = false
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: opts.title || 'ПНК · клиенту',
          text,
        })
        shared = true
      } catch {
        shared = false
      }
    }
    if (!copied && !shared) return { ok: false, error: 'share_failed', channel, message: text }
    return { ok: true, channel, copied, shared, opened: false, message: text }
  }

  const phone = normalizePhoneDigits(opts.clientPhone)
  const maxChatUrl = normalizeMaxChatUrl(opts.clientMaxChatUrl)
  let opened = false
  let openMode = null
  if (typeof window !== 'undefined') {
    if (maxChatUrl || phone) {
      const target = resolveMaxOpenTarget({ message: text, phone, maxChatUrl })
      opened = openMaxExternalUrl(target.url)
      openMode = target.mode
    } else {
      opened = openMaxExternalUrl(buildMaxShareUrl(text))
      openMode = 'share'
    }
  }

  if (!copied && !opened) return { ok: false, error: 'max_failed', channel, message: text }
  return { ok: true, channel, copied, shared: false, opened, openMode, message: text }
}
