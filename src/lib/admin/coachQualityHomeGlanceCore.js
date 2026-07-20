/**
 * Виджет «Качество ведения» на главной: шкала 0–100 с отметками порогов и факты брифа.
 * Чистые функции — без React/IDB.
 */
import { COACH_QUALITY_CARE_OK, COACH_QUALITY_CARE_WARN } from './coachQualityCore.js'

/** Отметки на шкале — те же пороги, что в правилах ведения (70 / 85). */
export const COACH_QUALITY_HOME_MARKERS = [
  { at: COACH_QUALITY_CARE_WARN, key: 'warn', label: '70', caption: 'Внимание' },
  { at: COACH_QUALITY_CARE_OK, key: 'ok', label: '85', caption: 'Ок' },
]

const BAND_LABEL = {
  ok: 'Ок',
  attention: 'Внимание',
  review: 'Разбор',
  unknown: '—',
}

/**
 * Полоса для бейджа: сначала факты брифа, иначе пороги шкалы.
 * Спокойный бриф → «Ок», даже если средний балл между 70 и 85.
 * @param {{
 *   scorePct?: number | null,
 *   reviewCount?: number,
 *   attentionCount?: number,
 *   droppedCount?: number,
 * }} [input]
 * @returns {'ok'|'attention'|'review'|'unknown'}
 */
export function resolveCoachQualityHomeBand(input = {}) {
  const reviewCount = Math.max(0, Number(input.reviewCount) || 0)
  const attentionCount = Math.max(0, Number(input.attentionCount) || 0)
  const droppedCount = Math.max(0, Number(input.droppedCount) || 0)
  if (reviewCount > 0) return 'review'
  if (attentionCount > 0 || droppedCount > 0) return 'attention'
  const n = Number(input.scorePct)
  if (!Number.isFinite(n)) return 'unknown'
  if (n < COACH_QUALITY_CARE_WARN) return 'review'
  return 'ok'
}

/**
 * Где балл на шкале относительно отметок 70 / 85 (только для подписи шкалы).
 * @param {number|null|undefined} scorePct
 * @returns {'ok'|'attention'|'review'|'unknown'}
 */
export function resolveCoachQualityScoreBand(scorePct) {
  const n = Number(scorePct)
  if (!Number.isFinite(n)) return 'unknown'
  if (n >= COACH_QUALITY_CARE_OK) return 'ok'
  if (n >= COACH_QUALITY_CARE_WARN) return 'attention'
  return 'review'
}

/**
 * @param {{
 *   scorePct?: number | null,
 *   reviewCount?: number,
 *   attentionCount?: number,
 *   droppedCount?: number,
 *   chipLabel?: string | null,
 * }} [input]
 */
export function buildCoachQualityHomeGlanceVm(input = {}) {
  const raw = Number(input.scorePct)
  const scorePct = Number.isFinite(raw) ? Math.round(raw) : null
  const reviewCount = Math.max(0, Number(input.reviewCount) || 0)
  const attentionCount = Math.max(0, Number(input.attentionCount) || 0)
  const droppedCount = Math.max(0, Number(input.droppedCount) || 0)
  const band = resolveCoachQualityHomeBand({
    scorePct,
    reviewCount,
    attentionCount,
    droppedCount,
  })
  const fillPct = scorePct == null ? 0 : Math.max(0, Math.min(100, scorePct))

  /** @type {Array<{ id: string, value: number, label: string, tone: 'hot'|'warn'|'neutral' }>} */
  const facts = []
  if (reviewCount > 0) {
    facts.push({ id: 'review', value: reviewCount, label: 'на разбор', tone: 'hot' })
  }
  if (attentionCount > 0) {
    facts.push({ id: 'attention', value: attentionCount, label: 'внимание', tone: 'warn' })
  }
  if (droppedCount > 0) {
    facts.push({ id: 'dropped', value: droppedCount, label: 'просели', tone: 'warn' })
  }

  const chip = String(input.chipLabel ?? '').trim()
  const headline =
    chip ||
    (facts.length === 0 ? 'По клубу спокойно — дневники в порядке' : null)

  return {
    scorePct,
    fillPct,
    band,
    bandLabel: BAND_LABEL[band] || BAND_LABEL.unknown,
    markers: COACH_QUALITY_HOME_MARKERS,
    facts,
    periodLabel: 'за месяц',
    scoreCaption: 'средний балл',
    headline,
    calm: facts.length === 0,
  }
}
