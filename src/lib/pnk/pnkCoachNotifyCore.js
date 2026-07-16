/**
 * Уведомление тренера о ПНК — как ДЗ/питание: «В Max» или «Другой мессенджер».
 */
import {
  buildMaxShareUrl,
  copyTextToClipboard,
  normalizeMaxChatUrl,
  normalizePhoneDigits,
  openMaxExternalUrl,
  resolveMaxOpenTarget,
} from '../trainer/trainerClientOutreachCore.js'
import { PNK_STAGE_LABELS, parsePnkDeliverables } from './pnkStagesCore.js'
import { formatDateRu } from '../dateRu.js'

/** @typedef {'created'|'call'|'agreed'|'trial'|'package'|'noshow'|'won'|'lost'|'general'} PnkCoachNotifyKind */
/** @typedef {'max' | 'other'} PnkCoachNotifyChannel */

/**
 * Какой текст уместен по состоянию карточки.
 * @param {object} client
 */
export function resolvePnkCoachNotifyKind(client) {
  const stage = String(client?.pnk_stage ?? '')
  const d = parsePnkDeliverables(client?.pnk_deliverables)
  if (stage === 'won') return 'won'
  if (stage === 'lost') return 'lost'
  const trialDate = String(client?.pnk_trial_date ?? '').slice(0, 10)
  if (trialDate && !d.trial) {
    const today = new Date()
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    if (trialDate < iso) return 'noshow'
  }
  if (d.trial) {
    const needPkg = !d.nutrition || !d.homework
    if (needPkg) return 'package'
    return 'trial'
  }
  if (client?.pnk_trial_date) return 'agreed'
  if (!d.contact) return 'call'
  return 'created'
}

/**
 * @param {string} kind
 * @param {{
 *   client?: { name?: string, phone?: string | null, pnk_stage?: string, pnk_trial_date?: string | null, pnk_trial_time?: string | null, pnk_comment?: string | null },
 *   trainerName?: string,
 *   managerName?: string,
 *   clubName?: string,
 * }} ctx
 */
export function buildPnkCoachNotifyMessage(kind, ctx = {}) {
  const clientName = String(ctx.client?.name ?? '').trim() || 'клиент'
  const clientPhone = String(ctx.client?.phone ?? '').trim()
  const trainerName = String(ctx.trainerName ?? '').trim()
  const managerName = String(ctx.managerName ?? '').trim()
  const clubName = String(ctx.clubName ?? '').trim()
  const stageLabel = PNK_STAGE_LABELS[ctx.client?.pnk_stage] || ''
  const trialDate = String(ctx.client?.pnk_trial_date ?? '').slice(0, 10)
  const trialTime = String(ctx.client?.pnk_trial_time ?? '').trim()
  const comment = String(ctx.client?.pnk_comment ?? '').trim()

  const head = clubName ? `FIT-CITY · ${clubName}` : 'FIT-CITY'
  const who = trainerName ? `${trainerName}, ` : ''
  const phoneLine = clientPhone ? `Тел. клиента: ${clientPhone}` : 'Телефон клиента не указан'
  const from = managerName ? `От: ${managerName}` : ''

  /** @type {string[]} */
  let lines = []

  switch (kind) {
    case 'created':
    case 'call':
      lines = [
        head,
        `${who}вам назначен ПНК: ${clientName}.`,
        phoneLine,
        'Нужно связаться и согласовать дату пробной.',
        from,
      ]
      break
    case 'agreed':
      lines = [
        head,
        `${who}ПНК ${clientName}: пробная согласована.`,
        trialDate
          ? `Когда: ${formatDateRu(trialDate)}${trialTime ? ` ${trialTime}` : ''}`
          : 'Дата ещё уточняется.',
        phoneLine,
        from,
      ]
      break
    case 'trial':
      lines = [
        head,
        `${who}ПНК ${clientName}: пробная проведена.`,
        'Проверьте пакет: питание и ДЗ, затем оформление.',
        from,
      ]
      break
    case 'package':
      lines = [
        head,
        `${who}ПНК ${clientName}: после пробной ещё нет питания и/или ДЗ.`,
        'Выдайте пакет клиенту в карточке FIT-CITY.',
        from,
      ]
      break
    case 'noshow':
      lines = [
        head,
        `${who}ПНК ${clientName}: неявка на пробную${trialDate ? ` (${formatDateRu(trialDate)})` : ''}.`,
        'Отметьте в приложении: перенести дату или закрыть отказ.',
        phoneLine,
        from,
      ]
      break
    case 'won':
      lines = [head, `${who}ПНК ${clientName} оформлен (ДК). Отлично!`, from]
      break
    case 'lost':
      lines = [head, `${who}ПНК ${clientName}: отказ (воронка закрыта).`, from]
      break
    default:
      lines = [
        head,
        `${who}ПНК ${clientName}${stageLabel ? ` · ${stageLabel}` : ''}.`,
        phoneLine,
        from,
      ]
  }

  if (comment && kind !== 'won' && kind !== 'lost') {
    lines.push(`Комментарий: ${comment}`)
  }

  return lines.filter(Boolean).join('\n')
}

/**
 * Как у ДЗ: channel max | other.
 * @param {string} message
 * @param {{
 *   channel?: PnkCoachNotifyChannel,
 *   trainerPhone?: string | null,
 *   trainerMaxChatUrl?: string | null,
 *   title?: string,
 * }} [opts]
 */
export async function notifyPnkCoach(message, opts = {}) {
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
          title: opts.title || 'ПНК · тренеру',
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

  // Max: буфер + открыть Max (чат по телефону тренера или share с текстом)
  const phone = normalizePhoneDigits(opts.trainerPhone)
  const maxChatUrl = normalizeMaxChatUrl(opts.trainerMaxChatUrl)
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
  return {
    ok: true,
    channel,
    copied,
    shared: false,
    opened,
    openMode,
    message: text,
  }
}

/** @deprecated используйте notifyPnkCoach(..., { channel: 'other' }) */
export async function sharePnkCoachMessage(message, opts = {}) {
  return notifyPnkCoach(message, { ...opts, channel: 'other' })
}
