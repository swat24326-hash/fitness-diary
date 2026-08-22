/**
 * Отправка PNG-карточки клиенту: Max или «Другой мессенджер».
 *
 * Max: «Поделиться» с PNG (Max в списке) или PNG в загрузки + короткая подпись в буфер + чат без текста.
 * Не используем max.ru/:share?text= — подставляет текст без картинки.
 *
 * Другой: «Поделиться» только с файлом + полный текст в буфер; иначе загрузки + буфер.
 */

import {
  copyTextToClipboard,
  normalizeMaxChatUrl,
  openMaxExternalUrl,
} from './trainerClientOutreachCore.js'

/** @typedef {'max' | 'other'} TrainerPngShareChannel */

/**
 * Куда открыть Max для PNG: прямой чат или приложение без предзаполненного текста.
 * @param {{ maxChatUrl?: string | null }} input
 */
export function resolveMaxPngOpenTarget(input = {}) {
  const direct = normalizeMaxChatUrl(input.maxChatUrl)
  if (direct) return { url: direct, mode: 'direct_chat' }
  return { url: 'https://max.ru', mode: 'app' }
}

/**
 * @param {{ ok?: boolean, cancelled?: boolean }} nativeResult
 */
export function shouldDownloadPngAfterOtherShare(nativeResult) {
  return nativeResult?.ok !== true && nativeResult?.cancelled !== true
}

/**
 * @param {{ copied?: boolean, opened?: boolean, shared?: boolean }} result
 */
export function isTrainerPngMaxDeliveryOk(result) {
  return result.shared === true || result.copied === true || result.opened === true
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
    if (res.copied) parts.push('подпись в буфере')
    parts.push('откройте Max · 📎 картинку · вставьте текст')
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
 * @param {{ filename: string }} payload
 */
export async function tryNativeSharePng(blob, payload) {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') {
    return { ok: false, mode: null }
  }

  const file = new File([blob], payload.filename, { type: 'image/png' })
  const fileOnly = { files: [file] }

  if (navigator.canShare && !navigator.canShare(fileOnly)) {
    return { ok: false, mode: null, unsupported: true }
  }

  try {
    await navigator.share(fileOnly)
    return { ok: true, mode: 'file' }
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
 *   client?: { max_chat_url?: string | null },
 * }} input
 */
export async function sendTrainerPngShare(input) {
  const channel = input.channel === 'other' ? 'other' : 'max'
  const text = String(input.text ?? '').trim()
  const title = String(input.title ?? '').trim() || text.slice(0, 80)
  const filename = String(input.filename ?? 'card.png').trim() || 'card.png'
  const caption = title

  if (!text && !caption) {
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

    const downloaded = downloadPngBlob(input.blob, filename)
    const native = await tryNativeSharePng(input.blob, { filename })

    if (native.cancelled) {
      return {
        ok: true,
        channel,
        shared: false,
        shareMode: null,
        cancelled: true,
        copied,
        downloaded,
        opened: false,
        openMode: null,
      }
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

  const native = await tryNativeSharePng(input.blob, { filename })

  if (native.cancelled) {
    return {
      ok: true,
      channel,
      shared: false,
      shareMode: null,
      cancelled: true,
      copied: false,
      downloaded,
      opened: false,
      openMode: null,
    }
  }

  if (native.ok) {
    let copied = false
    try {
      await copyTextToClipboard(caption)
      copied = true
    } catch {
      copied = false
    }
    return {
      ok: true,
      channel,
      shared: true,
      shareMode: 'file',
      cancelled: false,
      copied,
      downloaded,
      opened: false,
      openMode: 'native_share',
    }
  }

  let copied = false
  try {
    await copyTextToClipboard(caption)
    copied = true
  } catch {
    copied = false
  }

  let opened = false
  let openMode = null
  if (typeof window !== 'undefined') {
    const target = resolveMaxPngOpenTarget({ maxChatUrl: input.client?.max_chat_url })
    opened = openMaxExternalUrl(target.url)
    openMode = target.mode
  }

  const deliveryOk = isTrainerPngMaxDeliveryOk({ copied, opened, shared: false })
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
 *   shareMode?: 'file' | null,
 *   cancelled?: boolean,
 *   copied?: boolean,
 *   downloaded?: boolean,
 *   opened?: boolean,
 *   openMode?: 'direct_chat' | 'app' | 'native_share' | null,
 *   error?: string,
 * }} res
 */
export function formatTrainerPngShareStatus(res) {
  if (!res?.ok) return formatTrainerPngShareError(res)
  if (res.cancelled) return 'Отменено'

  const parts = []
  if (res.channel === 'other') {
    if (res.shared && res.shareMode === 'file') {
      parts.push('Выберите мессенджер — отправится картинка')
      if (res.copied) parts.push('текст в буфере — вставьте подпись')
      if (res.downloaded) parts.push('PNG также в загрузках')
    } else {
      if (res.downloaded) parts.push('PNG скачан')
      if (res.copied) parts.push('текст скопирован')
      parts.push('прикрепите картинку и вставьте текст')
    }
    return parts.join(' · ')
  }

  if (res.shared && res.openMode === 'native_share') {
    parts.push('В «Поделиться» выберите Max — уйдёт картинка')
    if (res.copied) parts.push('подпись в буфере')
    if (res.downloaded) parts.push('PNG также в загрузках')
    return parts.join(' · ')
  }

  if (res.downloaded) parts.push('PNG в загрузках')
  parts.push('в Max: 📎 прикрепите картинку')
  if (res.copied) parts.push('вставьте подпись из буфера')
  if (res.opened) {
    parts.push(res.openMode === 'direct_chat' ? 'открыт чат клиента' : 'открыт Max')
  }
  return parts.join(' · ') || 'Готово'
}
