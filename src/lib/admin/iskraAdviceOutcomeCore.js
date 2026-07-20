/**
 * Память эффекта советов ИСКРЫ: baseline → исход (план % / ₽).
 * Чистые функции — scripts/verify-iskra-advice-outcome.mjs
 */

import { estimateAdviceImpactRub } from './iskraActionImpactCore.js'
import { formatRubCompact } from './iskraReplyPhrasing.js'

const BASELINE_PREFIX = '[baseline]'
const OUTCOME_PREFIX = '[outcome]'

/**
 * @param {object | null | undefined} snapshot
 */
export function readAdviceSnapshotMetrics(snapshot) {
  const sales = snapshot?.sales ?? {}
  const insights = snapshot?.insights ?? {}
  return {
    plan_pct: Number(insights.plan?.pct ?? sales.plan_progress_pct) || 0,
    profit_total: Number(sales.profit_total) || 0,
    plan_total: Number(sales.plan_total) || Number(sales.plan_level_3) || 0,
    year: Number(snapshot?.period?.year) || null,
    month: Number(snapshot?.period?.month) || null,
  }
}

/**
 * @param {string} cardId
 * @param {object | null | undefined} snapshot
 * @param {{ source?: string }} [opts]
 */
export function captureAdviceBaseline(cardId, snapshot, opts = {}) {
  const id = String(cardId ?? '').trim()
  if (!id || !snapshot) return null
  const m = readAdviceSnapshotMetrics(snapshot)
  const impact = estimateAdviceImpactRub(id, snapshot)
  return {
    card_id: id,
    captured_at: new Date().toISOString(),
    source: String(opts.source ?? 'insight').trim() || 'insight',
    year: m.year,
    month: m.month,
    plan_pct: m.plan_pct,
    profit_total: m.profit_total,
    impact_rub_est: impact,
  }
}

/**
 * @param {object} baseline
 */
export function encodeAdviceBaselineNote(baseline) {
  if (!baseline?.card_id) return ''
  return [
    BASELINE_PREFIX,
    `card=${baseline.card_id}`,
    `plan_pct=${Number(baseline.plan_pct) || 0}`,
    `profit=${Number(baseline.profit_total) || 0}`,
    `impact=${baseline.impact_rub_est == null ? '' : Math.round(Number(baseline.impact_rub_est) || 0)}`,
    `ym=${baseline.year ?? ''}-${baseline.month ?? ''}`,
    `src=${baseline.source ?? 'insight'}`,
  ].join(' ')
}

/**
 * @param {string} note
 */
export function parseAdviceBaselineNote(note) {
  const s = String(note ?? '').trim()
  if (!s.startsWith(BASELINE_PREFIX)) return null
  const get = (key) => {
    const m = s.match(new RegExp(`${key}=([^\\s]+)`))
    return m?.[1] ?? ''
  }
  const card = get('card')
  if (!card) return null
  const ym = get('ym').split('-')
  const impactRaw = get('impact')
  return {
    card_id: card,
    plan_pct: Number(get('plan_pct')) || 0,
    profit_total: Number(get('profit')) || 0,
    impact_rub_est: impactRaw === '' ? null : Number(impactRaw) || 0,
    year: Number(ym[0]) || null,
    month: Number(ym[1]) || null,
    source: get('src') || 'insight',
  }
}

/**
 * @param {object} baseline
 * @param {object | null | undefined} currentSnapshot
 * @param {{ reason?: string }} [opts]
 */
export function settleAdviceOutcome(baseline, currentSnapshot, opts = {}) {
  if (!baseline?.card_id || !currentSnapshot) return null
  const cur = readAdviceSnapshotMetrics(currentSnapshot)
  const planDelta = Number((cur.plan_pct - (Number(baseline.plan_pct) || 0)).toFixed(1))
  const profitDelta = Math.round(cur.profit_total - (Number(baseline.profit_total) || 0))
  const est = baseline.impact_rub_est
  let vsEstimate = null
  if (est != null && Number(est) > 0) {
    vsEstimate = Math.round(profitDelta - Number(est))
  }
  const reason = String(opts.reason ?? 'snapshot').trim() || 'snapshot'
  const label = formatAdviceOutcomeLabel({
    cardId: baseline.card_id,
    planDelta,
    profitDelta,
  })
  return {
    card_id: baseline.card_id,
    reason,
    settled_at: new Date().toISOString(),
    plan_delta_pct: planDelta,
    profit_delta_rub: profitDelta,
    impact_rub_est: est ?? null,
    vs_estimate_rub: vsEstimate,
    label_ru: label,
    from_plan_pct: Number(baseline.plan_pct) || 0,
    to_plan_pct: cur.plan_pct,
  }
}

/**
 * @param {{ cardId: string, planDelta: number, profitDelta: number }} opts
 */
export function formatAdviceOutcomeLabel(opts) {
  const card = String(opts.cardId ?? 'совет')
  const pd = Number(opts.planDelta) || 0
  const rub = Number(opts.profitDelta) || 0
  const pdStr = `${pd > 0 ? '+' : ''}${String(pd).replace('.', ',')}%`
  const rubStr = rub === 0 ? 'без сдвига ₽' : `${rub > 0 ? '+' : '−'}${formatRubCompact(Math.abs(rub))}`
  return `Совет «${card}» → план ${pdStr} · ${rubStr}`
}

/**
 * @param {object} outcome
 */
export function encodeAdviceOutcomeNote(outcome) {
  if (!outcome?.card_id) return ''
  return [
    OUTCOME_PREFIX,
    `card=${outcome.card_id}`,
    `plan_delta=${outcome.plan_delta_pct}`,
    `profit_delta=${outcome.profit_delta_rub}`,
    `label=${String(outcome.label_ru ?? '').replace(/\s+/g, '_')}`,
  ].join(' ')
}

/**
 * @param {string} note
 */
export function parseAdviceOutcomeNote(note) {
  const s = String(note ?? '').trim()
  if (!s.startsWith(OUTCOME_PREFIX)) return null
  const get = (key) => {
    const m = s.match(new RegExp(`${key}=([^\\s]+)`))
    return m?.[1] ?? ''
  }
  const card = get('card')
  if (!card) return null
  return {
    card_id: card,
    plan_delta_pct: Number(get('plan_delta')) || 0,
    profit_delta_rub: Number(get('profit_delta')) || 0,
    label_ru: String(get('label') ?? '').replace(/_/g, ' '),
  }
}

/**
 * @param {Array<{ signal_key?: string, playbook_note?: string, playbook_confirmed?: boolean }>} signals
 */
export function extractAdviceBaselines(signals) {
  const out = []
  for (const s of signals ?? []) {
    const parsed = parseAdviceBaselineNote(s.playbook_note)
    if (!parsed) continue
    out.push({ ...parsed, signal_key: s.signal_key })
  }
  return out
}

/**
 * @param {Array<{ signal_key?: string, playbook_note?: string }>} signals
 */
export function extractAdviceOutcomes(signals) {
  const out = []
  for (const s of signals ?? []) {
    const parsed = parseAdviceOutcomeNote(s.playbook_note)
    if (!parsed) continue
    if (!parsed.label_ru || parsed.label_ru === parsed.card_id) {
      parsed.label_ru = formatAdviceOutcomeLabel({
        cardId: parsed.card_id,
        planDelta: parsed.plan_delta_pct,
        profitDelta: parsed.profit_delta_rub,
      })
    }
    out.push({ ...parsed, signal_key: s.signal_key })
  }
  return out.slice(0, 6)
}

/**
 * Settle baselines that still lack an outcome for the same card.
 * @param {Array<object>} signals
 * @param {object | null | undefined} snapshot
 * @param {{ minPlanDeltaAbs?: number }} [opts]
 */
export function settleOpenAdviceBaselines(signals, snapshot, opts = {}) {
  if (!snapshot) return []
  const baselines = extractAdviceBaselines(signals)
  const outcomes = new Set(extractAdviceOutcomes(signals).map((o) => o.card_id))
  const minAbs = Number(opts.minPlanDeltaAbs) || 0.5
  const settled = []
  for (const b of baselines) {
    if (outcomes.has(b.card_id)) continue
    const outcome = settleAdviceOutcome(b, snapshot, { reason: 'prefetch' })
    if (!outcome) continue
    if (Math.abs(outcome.plan_delta_pct) < minAbs && Math.abs(outcome.profit_delta_rub) < 1000) {
      continue
    }
    settled.push(outcome)
  }
  return settled
}

/**
 * @param {Array<object>} outcomes
 */
export function buildAdviceOutcomesPromptBlock(outcomes) {
  const list = (outcomes ?? []).slice(0, 4)
  if (!list.length) return ''
  const lines = list.map((o) => `· ${o.label_ru || formatAdviceOutcomeLabel({
    cardId: o.card_id,
    planDelta: o.plan_delta_pct,
    profitDelta: o.profit_delta_rub,
  })}`)
  return `ИСХОДЫ СОВЕТОВ (что сработало в клубе): ${lines.join(' ')}`
}

/**
 * @param {Array<object>} outcomes
 */
export function buildAdviceOutcomeSparkLine(outcomes) {
  const best = (outcomes ?? []).find((o) => (Number(o.plan_delta_pct) || 0) > 0.5)
  if (!best) return null
  return best.label_ru || formatAdviceOutcomeLabel({
    cardId: best.card_id,
    planDelta: best.plan_delta_pct,
    profitDelta: best.profit_delta_rub,
  })
}

/**
 * Learning event for baseline capture.
 * @param {object} baseline
 * @param {{ clubId: string, advisorRoleId?: string }} ctx
 */
export function adviceBaselineToLearningEvent(baseline, ctx) {
  const clubId = String(ctx.clubId ?? '').trim()
  if (!clubId || !baseline?.card_id) return null
  return {
    club_id: clubId,
    event_type: 'advice_baseline',
    signal_key: `advice:baseline_${baseline.card_id}`,
    advisor_role_id: String(ctx.advisorRoleId ?? 'app_admin').trim() || 'app_admin',
    user_message: '',
    note: encodeAdviceBaselineNote(baseline),
    created_at: new Date().toISOString(),
    meta: { source: 'advice_outcome', card_id: baseline.card_id },
  }
}

/**
 * @param {object} outcome
 * @param {{ clubId: string, advisorRoleId?: string }} ctx
 */
export function adviceOutcomeToLearningEvent(outcome, ctx) {
  const clubId = String(ctx.clubId ?? '').trim()
  if (!clubId || !outcome?.card_id) return null
  return {
    club_id: clubId,
    event_type: 'advice_outcome',
    signal_key: `advice:outcome_${outcome.card_id}`,
    advisor_role_id: String(ctx.advisorRoleId ?? 'app_admin').trim() || 'app_admin',
    user_message: '',
    note: encodeAdviceOutcomeNote(outcome),
    created_at: new Date().toISOString(),
    meta: {
      source: 'advice_outcome',
      card_id: outcome.card_id,
      plan_delta_pct: outcome.plan_delta_pct,
      profit_delta_rub: outcome.profit_delta_rub,
    },
  }
}
