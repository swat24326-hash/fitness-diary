/**
 * Короткая подсказка тренеру по качеству ведения (тонкие + хвосты).
 * Чистые функции из строки aggregateCoachQuality.
 */

const THIN_KINDS = new Set(['thin_training'])
const STUCK_KINDS = new Set(['stuck_dk', 'stuck_bz'])

/**
 * @param {object|null|undefined} trainerRow строка из coachQuality.trainers
 * @param {{ maxFacts?: number }} [opts]
 * @returns {{
 *   thin: number,
 *   stuck: number,
 *   bagWarn: number,
 *   hasSignal: boolean,
 *   headline: string|null,
 *   factsPreview: { clientId: string, clientName: string, kind: string, reason: string|null }[],
 * } | null}
 */
export function buildTrainerCoachQualityGlance(trainerRow, opts = {}) {
  if (!trainerRow || typeof trainerRow !== 'object') return null
  const thin = Math.max(0, Number(trainerRow.minimalCompleted) || 0)
  const stuck = Math.max(0, Number(trainerRow.stuckCount) || 0)
  const bagWarn = Math.max(0, Number(trainerRow.bagWarnCount) || 0)
  const maxFacts = Math.max(1, Math.min(8, Number(opts.maxFacts) || 4))

  const facts = Array.isArray(trainerRow.facts) ? trainerRow.facts : []
  const preview = []
  const seen = new Set()
  for (const f of facts) {
    const kind = String(f?.kind ?? '')
    if (!THIN_KINDS.has(kind) && !STUCK_KINDS.has(kind)) continue
    const clientId = String(f?.clientId ?? '').trim()
    if (!clientId || seen.has(clientId)) continue
    seen.add(clientId)
    preview.push({
      clientId,
      clientName: String(f?.clientName ?? '').trim() || clientId,
      kind,
      reason: f?.reason ? String(f.reason) : null,
    })
    if (preview.length >= maxFacts) break
  }

  const thinPart = thin > 0 ? (thin === 1 ? '1 тонкая тренировка' : `${thin} тонких тренировок`) : null
  const stuckPart = stuck > 0 ? ruTails(stuck) : null
  const headlineParts = [thinPart, stuckPart].filter(Boolean)
  let headline = headlineParts.length ? `У вас ${headlineParts.join(' и ')}` : null
  if (!headline && bagWarn > 0) {
    headline =
      bagWarn === 1 ? 'У вас 1 клиент в коридоре 8–14 дней' : `У вас ${bagWarn} в коридоре 8–14 дней`
  }

  return {
    thin,
    stuck,
    bagWarn,
    hasSignal: Boolean(headline),
    headline,
    factsPreview: preview,
  }
}

function ruTails(n) {
  const abs = Math.abs(n)
  const mod10 = abs % 10
  const mod100 = abs % 100
  if (mod10 === 1 && mod100 !== 11) return `${abs} хвост`
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${abs} хвоста`
  return `${abs} хвостов`
}
