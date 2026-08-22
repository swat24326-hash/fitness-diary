/**
 * Отправка PNG-карточки клиенту: Max или «Другой мессенджer».
 *
 * Планшет: «Поделиться» с PNG (выбрать Max) или картинка в буфер — download там часто не работает.
 * Компьютер: PNG в загрузки + подпись в буфер + открыть Max.
 */

import {
  buildMaxShareUrl,
  copyTextToClipboard,
  normalizeMaxChatUrl,
  openMaxExternalUrl,
} from './trainerClientOutreachCore.js'

/** @typedef {'max' | 'other'} TrainerPngShareChannel */

/**
 * @param {{ maxChatUrl?: string | null, caption?: string }} input
 */
export function resolveMaxPngOpenTarget(input = {}) {
  const direct = normalizeMaxChatUrl(input.maxChatUrl)
  if (direct) return { url: direct, mode: 'direct_chat' }
  const caption = String(input.caption ?? '').trim()
  if (caption) return { url: buildMaxShareUrl(caption), mode: 'share' }
  return { url: 'https://max.ru', mode: 'app' }
}

/**
 * @param {{ ok?: boolean, cancelled?: boolean }} nativeResult
 */
export function shouldDownloadPngAfterOtherShare(nativeResult) {
  return nativeResult?.ok !== true && nativeResult?.cancelled !== true
}

/**
 * @param {{ copied?: boolean, copiedImage?: boolean, opened?: boolean, shared?: boolean }} result
 */
export function isTrainerPngMaxDeliveryOk(result) {
  return (
    result.shared === true ||
    result.copied === true ||
    result.copiedImage === true ||
    result.opened === true
  )
}

/**
 * @param {{ ok?: boolean, channel?: TrainerPngShareChannel, shared?: boolean, copied?: boolean, copiedImage?: boolean, downloaded?: boolean, cancelled?: boolean }} res
 */
export function isTrainerPngShareUsable(res) {
  if (!res?.ok) return false
  if (res.cancelled) return true
  if (res.channel === 'max') return isTrainerPngMaxDeliveryOk(res)
  if (res.channel === 'other') {
    return res.shared === true || res.downloaded === true || res.copied === true
  }
  return false
}

/**
 * @param {{ error?: string, copied?: boolean, copiedImage?: boolean, downloaded?: boolean }} res
 */
export function formatTrainerPngShareError(res) {
  if (res.error === 'empty_text') return 'Нет текста для отправки'
  if (res.error === 'max_failed') {
    const parts = []
    if (res.downloaded) parts.push('PNG в загрузках')
    if (res.copiedImage) parts.push('картинка в буфере')
    if (res.copied) parts.push('подпись в буфере')
    parts.push('откройте Max и вставьте')
    return parts.join(' · ')
  }
  if (res.error === 'share_failed') return 'Не удалось поделиться · PNG в загрузках · текст в буфере'
  return 'Не удалось отправить'
}

/** Есть ли на устройстве «Поделиться» с файлом (планшет / телефон). */
export function canSharePngFiles() {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return false
  if (typeof navigator.canShare !== 'function') return true
  try {
    const probe = new File([new Blob([0], { type: 'image/png' })], 'probe.png', { type: 'image/png' })
    return navigator.canShare({ files: [probe] })
  } catch {
    return false
  }
}

/**
 * @param {Blob} blob
 * @param {string} filename
 */
export function downloadPngBlob(blob, filename) {
  if (typeof document === 'undefined') return false
  try {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 2000)
    return true
  } catch {
    return false
  }
}

/** Картинка в буфер (на планшете можно вставить в Max долгим нажатием). */
export async function copyPngToClipboard(blob) {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    return false
  }
  try {
    const pngBlob = blob instanceof Blob ? blob : new Blob([blob], { type: 'image/png' })
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })])
    return true
  } catch {
    return false
  }
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
 * «Поделиться» → Max: файл + короткая подпись (только для кнопки «В Max» на планшете).
 * @param {Blob} blob
 * @param {{ filename: string, caption?: string }} payload
 */
export async function tryNativeSharePngToMax(blob, payload) {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') {
    return { ok: false, mode: null }
  }

  const file = new File([blob], payload.filename, { type: 'image/png' })
  const caption = String(payload.caption ?? '').trim()
  const candidates = caption ? [{ files: [file], text: caption }, { files: [file] }] : [{ files: [file] }]

  for (const sharePayload of candidates) {
    if (navigator.canShare && !navigator.canShare(sharePayload)) continue
    try {
      await navigator.share(sharePayload)
      return { ok: true, mode: 'file' }
    } catch (e) {
      if (e?.name === 'AbortError') return { ok: false, mode: null, cancelled: true }
    }
  }

  return { ok: false, mode: null }
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
        copiedImage: false,
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
        copiedImage: false,
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
      copiedImage: false,
      downloaded,
      opened: false,
      openMode: null,
    }
  }

  let copied = false
  try {
    await copyTextToClipboard(caption)
    copied = true
  } catch {
    copied = false
  }

  const copiedImage = await copyPngToClipboard(input.blob)
  const downloaded = downloadPngBlob(input.blob, filename)

  if (canSharePngFiles()) {
    const native = await tryNativeSharePngToMax(input.blob, { filename, caption })
    if (native.ok) {
      return {
        ok: true,
        channel,
        shared: true,
        shareMode: 'file',
        cancelled: false,
        copied,
        copiedImage,
        downloaded,
        opened: false,
        openMode: 'native_share',
      }
    }
    if (native.cancelled) {
      return {
        ok: true,
        channel,
        shared: false,
        shareMode: null,
        cancelled: true,
        copied,
        copiedImage,
        downloaded,
        opened: false,
        openMode: null,
      }
    }
  }

  let opened = false
  let openMode = null
  if (typeof window !== 'undefined') {
    const target = resolveMaxPngOpenTarget({
      maxChatUrl: input.client?.max_chat_url,
      caption,
    })
    opened = openMaxExternalUrl(target.url)
    openMode = target.mode
  }

  const deliveryOk = isTrainerPngMaxDeliveryOk({ copied, copiedImage, opened, shared: false })
  if (!deliveryOk) {
    return {
      ok: false,
      error: 'max_failed',
      channel,
      shared: false,
      shareMode: null,
      cancelled: false,
      copied,
      copiedImage,
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
    copiedImage,
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
 *   copiedImage?: boolean,
 *   downloaded?: boolean,
 *   opened?: boolean,
 *   openMode?: 'direct_chat' | 'app' | 'share' | 'native_share' | null,
 *   error?: string,
 * }} res
 */
export function formatTrainerPngShareStatus(res) {
  if (!res?.ok) return formatTrainerPngShareError(res)
  if (res.cancelled) {
    const parts = ['Отменено']
    if (res.copied) parts.push('подпись в буфере')
    if (res.copiedImage) parts.push('картинка в буфере — вставьте в Max')
    if (res.downloaded) parts.push('PNG в загрузках')
    return parts.join(' · ')
  }

  const parts = []
  if (res.channel === 'other') {
    if (res.shared && res.shareMode === 'file') {
      parts.push('Выберите мессенджer — отправится картинка')
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
    parts.push('Выберите Max — уйдёт картинка')
    if (res.copied) parts.push('подпись в буфере')
    return parts.join(' · ')
  }

  if (res.copiedImage) parts.push('картинка в буфере — вставьте в Max')
  else if (res.downloaded) parts.push('PNG в загрузках — 📎 прикрепите')
  else parts.push('в Max: 📎 прикрепите картинку')

  if (res.copied) parts.push('подпись в буфере')
  if (res.opened) {
    parts.push(
      res.openMode === 'direct_chat'
        ? 'открыт чат клиента'
        : res.openMode === 'share'
          ? 'открыто окно Max'
          : 'открыт Max',
    )
  }
  return parts.join(' · ') || 'Готово'
}
