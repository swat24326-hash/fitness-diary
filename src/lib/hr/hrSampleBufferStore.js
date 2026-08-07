/**
 * Буфер сэмплов пульса в sessionStorage (переживает reload вкладки).
 * Ключ v2: тренер + клиент + trainingId — иначе хвост прошлой тренировки
 * попадает на новую.
 */

import { HR_SAMPLE_MAX_POINTS } from './hrSessionAgg.js'

const PREFIX_V1 = 'fitness-diary-hr-samples-v1:'
const PREFIX_V2 = 'fitness-diary-hr-samples-v2:'

/**
 * @param {string | null | undefined} trainerUserId
 * @param {string | null | undefined} clientId
 * @param {string | null | undefined} [trainingId]
 */
export function hrSamplesStorageKey(trainerUserId, clientId, trainingId) {
  const uid = String(trainerUserId ?? '').trim() || 'anon'
  const cid = String(clientId ?? '').trim() || 'x'
  const tid = String(trainingId ?? '').trim() || '_'
  return `${PREFIX_V2}${uid}:${cid}:${tid}`
}

/** Старый ключ без trainingId (до фикса «чужого» пульса). */
export function hrSamplesLegacyStorageKey(trainerUserId, clientId) {
  return `${PREFIX_V1}${String(trainerUserId ?? '').trim() || 'anon'}:${String(clientId ?? '').trim() || 'x'}`
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
 * @param {string | null | undefined} [trainingId]
 */
export function readHrSamples(trainerUserId, clientId, trainingId) {
  if (typeof sessionStorage === 'undefined') return []
  const uid = String(trainerUserId ?? '').trim()
  const cid = String(clientId ?? '').trim()
  const tid = String(trainingId ?? '').trim()
  if (!uid || !cid || !tid) return []
  try {
    const raw = sessionStorage.getItem(hrSamplesStorageKey(uid, cid, tid))
    if (!raw) return []
    return parseHrSamples(raw)
  } catch {
    return []
  }
}

/**
 * @param {string | null | undefined} trainerUserId
 * @param {string | null | undefined} clientId
 * @param {string | null | undefined} trainingId
 * @param {Array<{ t: number, bpm: number }>} samples
 */
export function writeHrSamples(trainerUserId, clientId, trainingId, samples) {
  if (typeof sessionStorage === 'undefined') return
  const uid = String(trainerUserId ?? '').trim()
  const cid = String(clientId ?? '').trim()
  const tid = String(trainingId ?? '').trim()
  if (!uid || !cid || !tid) return
  try {
    const list = parseHrSamples(samples).slice(-HR_SAMPLE_MAX_POINTS)
    sessionStorage.setItem(hrSamplesStorageKey(uid, cid, tid), JSON.stringify(list))
  } catch {
    /* quota */
  }
}

/**
 * @param {string | null | undefined} trainerUserId
 * @param {string | null | undefined} clientId
 * @param {string | null | undefined} [trainingId]
 */
export function clearHrSamples(trainerUserId, clientId, trainingId) {
  if (typeof sessionStorage === 'undefined') return
  const uid = String(trainerUserId ?? '').trim()
  const cid = String(clientId ?? '').trim()
  if (!uid || !cid) return
  try {
    const tid = String(trainingId ?? '').trim()
    if (tid) {
      sessionStorage.removeItem(hrSamplesStorageKey(uid, cid, tid))
    }
  } catch {
    /* ignore */
  }
}

/** Убрать хвост v1 (клиент без trainingId) — источник «пульса без датчика». */
export function clearLegacyHrSamples(trainerUserId, clientId) {
  if (typeof sessionStorage === 'undefined') return
  const uid = String(trainerUserId ?? '').trim()
  const cid = String(clientId ?? '').trim()
  if (!uid || !cid) return
  try {
    sessionStorage.removeItem(hrSamplesLegacyStorageKey(uid, cid))
  } catch {
    /* ignore */
  }
}

/**
 * Перенос буфера при первом сохранении new → uuid.
 * @param {string | null | undefined} trainerUserId
 * @param {string | null | undefined} clientId
 * @param {string | null | undefined} fromTrainingId
 * @param {string | null | undefined} toTrainingId
 */
export function migrateHrSamplesScope(trainerUserId, clientId, fromTrainingId, toTrainingId) {
  const from = String(fromTrainingId ?? '').trim()
  const to = String(toTrainingId ?? '').trim()
  if (!from || !to || from === to) return
  const samples = readHrSamples(trainerUserId, clientId, from)
  if (samples.length) writeHrSamples(trainerUserId, clientId, to, samples)
  clearHrSamples(trainerUserId, clientId, from)
}
