/**
 * Max с доски клиентов админа / менеджера: текст «от клуба» + открыть чат.
 * Не путать с Max тренера (личные шаблоны outreach_templates).
 */

import {
  buildOutreachMessage,
  copyTextToClipboard,
  isOutreachScenario,
  normalizeMaxChatUrl,
  normalizePhoneDigits,
  openMaxExternalUrl,
  resolveMaxOpenTarget,
} from '../trainer/trainerClientOutreachCore.js'

/**
 * Короткий текст, если нет сценария фильтра.
 * @param {string} clubName
 */
export function buildClubDeskMaxFallbackMessage(clubName) {
  const club = String(clubName ?? '').trim() || 'клуб'
  return `Здравствуйте! Это ${club}.`
}

/**
 * @param {{
 *   client?: { phone?: string | null, max_chat_url?: string | null, name?: string, outreach_name?: string | null },
 *   message?: string,
 * }} opts
 */
export async function runClubDeskMaxOpen(opts = {}) {
  const client = opts.client
  const phone = normalizePhoneDigits(client?.phone)
  const maxChatUrl = normalizeMaxChatUrl(client?.max_chat_url)
  if (!phone && !maxChatUrl) {
    return { ok: false, error: 'no_contact' }
  }

  const message = String(opts.message ?? '').trim()
  if (message) {
    try {
      await copyTextToClipboard(message)
    } catch {
      return { ok: false, error: 'copy_failed', message }
    }
  }

  const target = resolveMaxOpenTarget({
    message: message || ' ',
    phone,
    maxChatUrl,
  })

  let opened = false
  if (typeof window !== 'undefined') {
    opened = openMaxExternalUrl(target.url)
  }

  return {
    ok: true,
    message,
    opened,
    phone: phone || null,
    maxChatUrl: maxChatUrl || null,
    openMode: target.mode,
    copied: Boolean(message),
  }
}

/**
 * @param {{
 *   client: object,
 *   scenario?: string | null,
 *   memList?: object[],
 *   trainerName?: string,
 *   clubName?: string,
 *   membershipName?: string,
 *   today?: string,
 *   templates?: Record<string, string> | null,
 *   mode?: 'template' | 'custom',
 * }} opts
 */
export async function runClubDeskMaxOutreach(opts) {
  const scenario = String(opts.scenario ?? '').trim()
  let message = ''
  if (opts.mode === 'template' && isOutreachScenario(scenario)) {
    message = buildOutreachMessage(scenario, {
      client: opts.client,
      memList: opts.memList,
      trainerName: opts.trainerName,
      clubName: opts.clubName,
      membershipName: opts.membershipName,
      today: opts.today,
      templates: opts.templates,
    })
  } else {
    message = buildClubDeskMaxFallbackMessage(opts.clubName)
  }
  return runClubDeskMaxOpen({ client: opts.client, message })
}
