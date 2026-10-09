/**
 * Сообщения о сбоях прода в ВК от имени закрытого сообщества (docs/RELIABILITY_PLAN.md, этап 2a).
 * Получатель должен один раз написать сообществу — иначе ВК не даёт писать первым (ошибка 901).
 */
import { randomInt } from 'node:crypto'

const VK_API = 'https://api.vk.com/method/'
const VK_VERSION = '5.199'

/** @param {unknown} raw — `VK_ALERT_PEER_IDS`: id через запятую */
export function parseVkPeerIds(raw) {
  return [...new Set(String(raw ?? '').split(',').map((s) => s.trim()).filter((s) => /^\d+$/.test(s)))]
}

/** @param {{ error_code?: number, error_msg?: string }} err */
export function vkErrorRu(err) {
  const code = Number(err?.error_code) || 0
  if (code === 901) return 'получатель не писал сообществу — напишите ему любое сообщение'
  if (code === 5 || code === 27) return 'ключ сообщества недействителен — выпустите новый'
  if (code === 15 || code === 7) return 'у ключа нет права «сообщения сообщества»'
  if (code === 6 || code === 9) return 'ВК ограничил частоту отправки'
  return `ВК ошибка ${code || '?'}`
}

/**
 * @param {string} method
 * @param {Record<string, string | number>} params
 * @param {{ token: string, fetchImpl?: typeof fetch }} opts
 */
export async function vkCall(method, params, { token, fetchImpl = fetch }) {
  const body = new URLSearchParams({ ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])), access_token: token, v: VK_VERSION })
  const res = await fetchImpl(VK_API + method, { method: 'POST', body, signal: AbortSignal.timeout(10000) })
  const json = await res.json()
  if (json?.error) {
    const err = new Error(vkErrorRu(json.error))
    err.code = json.error.error_code
    throw err
  }
  return json?.response
}

/**
 * Отправить текст каждому получателю. Ошибка одного не мешает остальным.
 * @param {{ token: string, peerIds: string[], text: string, fetchImpl?: typeof fetch }} opts
 * @returns {Promise<{ sent: number, errors: string[] }>}
 */
export async function sendVkAlert({ token, peerIds, text, fetchImpl }) {
  if (!token || !peerIds.length) return { sent: 0, errors: ['нет VK_ALERT_TOKEN или VK_ALERT_PEER_IDS'] }
  let sent = 0
  const errors = []
  for (const peerId of peerIds) {
    try {
      await vkCall('messages.send', { peer_id: peerId, random_id: randomInt(1, 2 ** 31 - 1), message: text }, { token, fetchImpl })
      sent++
    } catch (e) {
      errors.push(`${peerId}: ${e?.message || e}`)
    }
  }
  return { sent, errors }
}
