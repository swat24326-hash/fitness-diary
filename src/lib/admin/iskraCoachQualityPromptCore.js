/**
 * ИСКРА × Качество ведения — компактный контекст для промпта/алертов.
 * Не тянет полный agg: принимает готовый brief или средний балл.
 */

/**
 * @param {{
 *   averageScorePct?: number | null,
 *   reviewCount?: number,
 *   attentionCount?: number,
 *   droppedCount?: number,
 *   chipLabel?: string,
 *   lines?: string[],
 *   topLines?: string[],
 * } | null | undefined} brief
 */
export function buildCoachQualityPromptBlock(brief) {
  if (!brief || typeof brief !== 'object') {
    return [
      'КАЧЕСТВО ВЕДЕНИЯ (контур клуба):',
      'В админке есть «Статистика → Качество ведения» (тонкие записи, stale-рацион, хвосты неактивных).',
      'Пороги по умолчанию: 7 / 14 / 30 дней и 70 / 85 % — не выдумывай другие.',
      'Если нет цифр в JSON — не называй баллы; предложи открыть блок качества или спросить «кто на разбор».',
    ].join('\n')
  }

  const avg =
    brief.averageScorePct != null && Number.isFinite(Number(brief.averageScorePct))
      ? Math.round(Number(brief.averageScorePct))
      : null
  const lines = Array.isArray(brief.lines) ? brief.lines.filter(Boolean) : []
  const top = Array.isArray(brief.topLines) ? brief.topLines.filter(Boolean).slice(0, 3) : []

  const parts = [
    'КАЧЕСТВО ВЕДЕНИЯ (факты клуба):',
    avg != null ? `Средний балл клуба ≈ ${avg}/100.` : 'Средний балл в этом запросе не передан.',
    brief.chipLabel ? `Сводка: ${brief.chipLabel}.` : '',
    lines.length ? `Бриф: ${lines.join('; ')}.` : '',
    top.length ? `На разбор: ${top.join('; ')}.` : '',
    'Советы: конкретные тренеры и оси (тонкие записи / рацион / хвосты), без общих лозунгов.',
    'Глубокий разбор — экран «Статистика → Качество ведения».',
  ]

  return parts.filter(Boolean).join('\n')
}

/**
 * @param {object | null | undefined} brief
 */
export function buildCoachQualityAlert(brief) {
  if (!brief) return null
  const review = Number(brief.reviewCount) || 0
  const dropped = Number(brief.droppedCount) || 0
  if (review <= 0 && dropped <= 0) return null
  const title =
    review > 0
      ? `Качество: ${review} на разбор`
      : `Качество: ${dropped} просели`
  const message =
    (Array.isArray(brief.lines) && brief.lines[0]) ||
    brief.chipLabel ||
    'Откройте «Качество ведения» или спросите ИСКРУ, кого разобрать.'
  return {
    id: 'coach_quality',
    severity: review > 0 ? 'warn' : 'accent',
    title,
    message: String(message).slice(0, 160),
    handlerId: 'advice',
    ctaMessage:
      'По качеству ведения: кто на разбор, кто просел, какие 2 действия тренерам на эту неделю?',
  }
}
