/**
 * Отправка PNG-карточки клиенту: Max или «Другой мессенджер».
 * Единый контур для рациона, ДЗ и похожих карточек.
 *
 * Max: PNG в загрузки + текст в буфер + открыть чат (без системного «Поделиться»).
 * Другой: «Поделиться» с файлом и текстом; иначе — загрузки + буфер.
 */

import {
  buildMaxShareUrl,
  copyTextToClipboard,
  normalizeMaxChatUrl,
  normalizePhoneDigits,
  openMaxExternalUrl,
  resolveMaxOpenTarget,
} from './trainerClientOutreachCore.js'

/** @typedef {'max' | 'other'} TrainerPngShareChannel */

/**
 * @param {{ ok?: boolean, cancelled?: boolean }} nativeResult
 */
export function shouldDownloadPngAfterOtherShare(nativeResult) {
  return nativeResult?.ok !== true && nativeResult?.cancelled !== true
}

/**
 * @param {{ copied?: boolean, opened?: boolean }} result
 */
export function isTrainerPngMaxDeliveryOk(result) {
  return result.copied === true || result.opened === true
}

/**
 * @param {{ ok?: boolean, channel?: TrainerPngShareChannel, shared?: boolean, copied?: boolean, downloaded?: boolean, cancelled?: boolean }} res
 */
export function isTrainerPngShareUsable(res) {
  if (!res?.ok) return false
  if (res.cancelled) return true
  if (res.channel === 'max') {
    return res.downloaded === true && isTrainerPngMaxDeliveryOk(res)
  }
  if (res.channel === 'other') {
    return res.shared === true || res.downloaded === true || res.copied === true
  }
  return false
}

/**
 * @param {{ error?: string, copied?: boolean, downloaded?: boolean }} res
 */
export function formatTrainerPngShareError(res) {
  if (res.error === 'empty_text') return 'Нет текста для отправки'
  if (res.error === 'max_failed') {
    const parts = []
    if (res.downloaded) parts.push('PNG в загрузках')
    if (res.copied) parts.push('текст в буфере')
    parts.push('откройте Max вручную и вставьте')
    return parts.join(' · ')
  }
  if (res.error === 'share_failed') return 'Не удалось поделиться · PNG в загрузках · текст в буфере'
  return 'Не удалось отправить'
}

/**
 * @param {Blob} blob
 * @param {string} filename
 */
export function downloadPngBlob(blob, filename) {
  if (typeof document === 'undefined') return false
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
  return true
}

/**
 * @param {Blob} blob
 * @param {{ filename: string, title: string, text: string }} payload
 * @returns {Promise<{ ok: boolean, mode: 'file' | 'text' | null, cancelled?: boolean }>}
 */
export async function tryNativeSharePng(blob, payload) {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') {
    return { ok: false, mode: null }
  }

  const file = new File([blob], payload.filename, { type: 'image/png' })
  const withFile = { files: [file], title: payload.title, text: payload.text }

  if (navigator.canShare?.(withFile)) {
    try {
      await navigator.share(withFile)
      return { ok: true, mode: 'file' }
    } catch (e) {
      if (e?.name === 'AbortError') return { ok: false, mode: null, cancelled: true }
    }
  }

  const textOnly = { title: payload.title, text: payload.text }
  if (navigator.canShare?.(textOnly)) {
    try {
      await navigator.share(textOnly)
      return { ok: true, mode: 'text' }
    } catch (e) {
      if (e?.name === 'AbortError') return { ok: false, mode: null, cancelled: true }
    }
  }

  try {
    await navigator.share(textOnly)
    return { ok: true, mode: 'text' }
  } catch (e) {
    if (e?.name === 'AbortError') return { ok: false, mode: null, cancelled: true }
    return { ok: false, mode: null }
  }
}

/**
 * @param {{
 *   blob: Blob,
 *   filename: string,
 *   title: string,
 *   text: string,
 *   channel?: TrainerPngShareChannel,
 *   client?: { phone?: string | null, max_chat_url?: string | null },
 * }} input
 */
export async function sendTrainerPngShare(input) {
  const channel = input.channel === 'other' ? 'other' : 'max'
  const text = String(input.text ?? '').trim()
  const title = String(input.title ?? '').trim() || text.slice(0, 80)
  const filename = String(input.filename ?? 'card.png').trim() || 'card.png'

  if (!text) {
    return { ok: false, error: 'empty_text', channel }
  }

  if (channel === 'other') {
    let copied = false
    try {
      await copyTextToClipboard(text)
      copied = true
    } catch {
      copied = false
    }

    const native = await tryNativeSharePng(input.blob, { filename, title, text })

    if (native.cancelled) {
      return {
        ok: true,
        channel,
        shared: false,
        shareMode: null,
        cancelled: true,
        copied,
        downloaded: false,
        opened: false,
        openMode: null,
      }
    }

    let downloaded = false
    if (shouldDownloadPngAfterOtherShare(native)) {
      downloaded = downloadPngBlob(input.blob, filename)
    }

    if (!native.ok && !copied && !downloaded) {
      return {
        ok: false,
        error: 'share_failed',
        channel,
        shared: false,
        shareMode: null,
        cancelled: false,
        copied: false,
        downloaded: false,
        opened: false,
        openMode: null,
      }
    }

    return {
      ok: true,
      channel,
      shared: native.ok,
      shareMode: native.mode,
      cancelled: false,
      copied,
      downloaded,
      opened: false,
      openMode: null,
    }
  }

  const downloaded = downloadPngBlob(input.blob, filename)

  let copied = false
  try {
    await copyTextToClipboard(text)
    copied = true
  } catch {
    copied = false
  }

  const phone = normalizePhoneDigits(input.client?.phone)
  const maxChatUrl = normalizeMaxChatUrl(input.client?.max_chat_url)
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

  const deliveryOk = isTrainerPngMaxDeliveryOk({ copied, opened })
  if (!deliveryOk) {
    return {
      ok: false,
      error: 'max_failed',
      channel,
      shared: false,
      shareMode: null,
      cancelled: false,
      copied,
      downloaded,
      opened,
      openMode,
    }
  }

  return {
    ok: true,
    channel,
    shared: false,
    shareMode: null,
    cancelled: false,
    copied,
    downloaded,
    opened,
    openMode,
  }
}

/**
 * @param {{
 *   ok?: boolean,
 *   channel?: TrainerPngShareChannel,
 *   shared?: boolean,
 *   shareMode?: 'file' | 'text' | null,
 *   cancelled?: boolean,
 *   copied?: boolean,
 *   downloaded?: boolean,
 *   opened?: boolean,
 *   openMode?: 'direct_chat' | 'share' | null,
 *   error?: string,
 * }} res
 */
export function formatTrainerPngShareStatus(res) {
  if (!res?.ok) return formatTrainerPngShareError(res)
  if (res.cancelled) return 'Отменено'

  const parts = []
  if (res.channel === 'other') {
    if (res.shared && res.shareMode === 'file') {
      parts.push('Выберите мессенджер — картинка и текст')
    } else if (res.shared && res.shareMode === 'text') {
      parts.push('Текст отправлен — прикрепите PNG из загрузок')
    } else {
      if (res.downloaded) parts.push('PNG скачан')
      if (res.copied) parts.push('текст скопирован')
      parts.push('прикрепите картинку в мессенджер')
    }
    return parts.join(' · ')
  }

  if (res.downloaded) parts.push('PNG скачан — прикрепите в Max')
  if (res.copied) parts.push('текст скопирован — вставьте в Max')
  if (res.opened) {
    parts.push(res.openMode === 'direct_chat' ? 'открыт чат Max' : 'открыто окно Max')
  }
  return parts.join(' · ') || 'Готово'
}
