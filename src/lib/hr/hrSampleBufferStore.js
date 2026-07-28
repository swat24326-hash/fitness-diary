/**
 * Буфер сэмплов пульса в sessionStorage (переживает reload вкладки).
 */

import { HR_SAMPLE_MAX_POINTS } from './hrSessionAgg.js'

const PREFIX = 'fitness-diary-hr-samples-v1:'

/**
 * @param {string | null | undefined} trainerUserId
 * @param {string | null | undefined} clientId
 */
export function hrSamplesStorageKey(trainerUserId, clientId) {
  return `${PREFIX}${String(trainerUserId ?? '').trim() || 'anon'}:${String(clientId ?? '').trim() || 'x'}`
}

/**
 * @param {unknown} raw
 * @returns {Array<{ t: number, bpm: number }>}
 */
export function parseHrSamples(raw) {
  let o = raw
  if (typeof raw === 'string') {
    try {
      o = JSON.parse(raw)
    } catch {
      return []
    }
  }
  if (!Array.isArray(o)) return []
  const list = []
  for (const row of o) {
    const t = Number(row?.t)
    const bpm = Number(row?.bpm)
    if (!Number.isFinite(t) || !Number.isFinite(bpm) || bpm <= 0 || bpm > 300) continue
    list.push({ t, bpm: Math.round(bpm) })
  }
  return list.slice(-HR_SAMPLE_MAX_POINTS)
}

/**
 * @param {string | null | undefined} trainerUserId
 * @param {string | null | undefined} clientId
 */
export function readHrSamples(trainerUserId, clientId) {
  if (typeof sessionStorage === 'undefined') return []
  const uid = String(trainerUserId ?? '').trim()
  const cid = String(clientId ?? '').trim()
  if (!uid || !cid) return []
  try {
    const raw = sessionStorage.getItem(hrSamplesStorageKey(uid, cid))
    if (!raw) return []
    return parseHrSamples(raw)
  } catch {
    return []
  }
}

/**
 * @param {string | null | undefined} trainerUserId
 * @param {string | null | undefined} clientId
 * @param {Array<{ t: number, bpm: number }>} samples
 */
export function writeHrSamples(trainerUserId, clientId, samples) {
  if (typeof sessionStorage === 'undefined') return
  const uid = String(trainerUserId ?? '').trim()
  const cid = String(clientId ?? '').trim()
  if (!uid || !cid) return
  try {
    const list = parseHrSamples(samples).slice(-HR_SAMPLE_MAX_POINTS)
    sessionStorage.setItem(hrSamplesStorageKey(uid, cid), JSON.stringify(list))
  } catch {
    /* quota */
  }
}

/**
 * @param {string | null | undefined} trainerUserId
 * @param {string | null | undefined} clientId
 */
export function clearHrSamples(trainerUserId, clientId) {
  if (typeof sessionStorage === 'undefined') return
  const uid = String(trainerUserId ?? '').trim()
  const cid = String(clientId ?? '').trim()
  if (!uid || !cid) return
  try {
    sessionStorage.removeItem(hrSamplesStorageKey(uid, cid))
  } catch {
    /* ignore */
  }
}
