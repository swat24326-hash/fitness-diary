/**
 * Утренний бриф качества ведения: кто на разбор / кто просел к прошлому периоду.
 * Чистые функции — без React/IDB.
 */
import { addDaysToIso } from '../dateRu.js'

export const COACH_QUALITY_SCORE_DROP_THRESHOLD = 5

const STATUS_RANK = {
  ok: 0,
  insufficient_data: 1,
  attention: 2,
  review: 3,
}

/**
 * Предыдущий период той же длины: … → [prevFrom..prevTo] → [dateFrom..dateTo].
 * @param {string} dateFrom
 * @param {string} dateTo
 * @returns {{ dateFrom: string, dateTo: string } | null}
 */
export function previousEqualPeriod(dateFrom, dateTo) {
  const from = String(dateFrom ?? '').slice(0, 10)
  const to = String(dateTo ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
    return null
  }
  const spanDays =
    Math.round(
      (Date.parse(`${to}T12:00:00`) - Date.parse(`${from}T12:00:00`)) / 86400000,
    ) || 0
  const prevTo = addDaysToIso(from, -1)
  const prevFrom = addDaysToIso(prevTo, -spanDays)
  return { dateFrom: prevFrom, dateTo: prevTo }
}

/**
 * @param {object|null|undefined} currentAgg aggregateCoachQuality result
 * @param {object|null|undefined} previousAgg
 * @param {{ trainerNameById?: Record<string, string> }} [opts]
 */
export function buildCoachQualityMorningBrief(currentAgg, previousAgg, opts = {}) {
  const nameById = opts.trainerNameById ?? {}
  const nowList = Array.isArray(currentAgg?.trainers) ? currentAgg.trainers : []
  const prevById = new Map(
    (Array.isArray(previousAgg?.trainers) ? previousAgg.trainers : []).map((t) => [
      String(t.trainerId),
      t,
    ]),
  )

  /** @type {object[]} */
  const focus = []
  for (const tr of nowList) {
    const status = String(tr?.status ?? '')
    if (status !== 'review' && status !== 'attention') continue
    const id = String(tr.trainerId ?? '')
    if (!id) continue
    const prev = prevById.get(id) ?? null
    const dropped = isTrainerDropped(tr, prev)
    focus.push({
      trainerId: id,
      name: String(nameById[id] ?? '').trim() || id,
      status,
      statusLabel: tr.statusLabel ?? status,
      scorePct: tr.scorePct ?? null,
      previousScorePct: prev?.scorePct ?? null,
      dropped,
      failureDirections: Array.isArray(tr.failureDirections) ? tr.failureDirections : [],
      failureDirectionLabels: Array.isArray(tr.failureDirectionLabels)
        ? tr.failureDirectionLabels
        : [],
    })
  }

  focus.sort((a, b) => {
    if (a.dropped !== b.dropped) return a.dropped ? -1 : 1
    const ra = STATUS_RANK[a.status] ?? 0
    const rb = STATUS_RANK[b.status] ?? 0
    if (ra !== rb) return rb - ra
    return (a.scorePct ?? 999) - (b.scorePct ?? 999)
  })

  const reviewCount = focus.filter((t) => t.status === 'review').length
  const attentionCount = focus.filter((t) => t.status === 'attention').length
  const droppedCount = focus.filter((t) => t.dropped).length

  const lines = []
  if (reviewCount > 0) lines.push(`${ruTrainers(reviewCount)} на разбор`)
  if (attentionCount > 0) lines.push(`${ruTrainers(attentionCount)} — внимание`)
  if (droppedCount > 0) {
    lines.push(
      droppedCount === 1
        ? '1 просел к прошлому периоду'
        : `${droppedCount} просели к прошлому периоду`,
    )
  }
  if (!lines.length) lines.push('По качеству ведения сейчас спокойно')

  const top = focus.slice(0, 3)
  const topLines = top.map((t) => {
    const axes = t.failureDirectionLabels.length
      ? t.failureDirectionLabels.join(', ')
      : 'без явной оси'
    const drop = t.dropped ? ' · просел' : ''
    return `${t.name}: ${t.statusLabel}${drop} (${axes})`
  })

  return {
    reviewCount,
    attentionCount,
    droppedCount,
    chipLabel: buildChipLabel(reviewCount, droppedCount),
    lines,
    topLines,
    trainers: focus,
    previousPeriod: previousAgg
      ? { dateFrom: previousAgg.dateFrom ?? null, dateTo: previousAgg.dateTo ?? null }
      : null,
  }
}

/**
 * @param {object} now
 * @param {object|null} prev
 */
export function isTrainerDropped(now, prev) {
  if (!prev) return false
  const nowRank = STATUS_RANK[String(now?.status)] ?? 0
  const prevRank = STATUS_RANK[String(prev?.status)] ?? 0
  if (nowRank > prevRank) return true
  const nowScore = Number(now?.scorePct)
  const prevScore = Number(prev?.scorePct)
  if (!Number.isFinite(nowScore) || !Number.isFinite(prevScore)) return false
  return prevScore - nowScore >= COACH_QUALITY_SCORE_DROP_THRESHOLD
}

function buildChipLabel(reviewCount, droppedCount) {
  if (reviewCount > 0 && droppedCount > 0) {
    return `${reviewCount} на разбор · ${droppedCount} просели`
  }
  if (reviewCount > 0) return `${reviewCount} на разбор`
  if (droppedCount > 0) return `${droppedCount} просели к прошлому периоду`
  return null
}

function ruTrainers(n) {
  const abs = Math.abs(Number(n) || 0)
  const mod10 = abs % 10
  const mod100 = abs % 100
  if (mod10 === 1 && mod100 !== 11) return `${abs} тренер`
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${abs} тренера`
  return `${abs} тренеров`
}
