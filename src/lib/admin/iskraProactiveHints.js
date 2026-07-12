/**
 * Проактивные подсказки ИСКРЫ для компактного дока (из KPI prefetch).
 */

/**
 * @param {object | null | undefined} kpi
 * @param {{ clubName?: string }} [opts]
 * @returns {Array<{ id: string, label: string, message: string, tone?: string }>}
 */
export function buildIskraProactiveHints(kpi, opts = {}) {
  const hints = []
  const planPct = Number(kpi?.plan_progress_pct)
  const reports = Number(kpi?.report_days) || 0
  const club = String(opts.clubName ?? '').trim()

  if (Number.isFinite(planPct)) {
    if (planPct < 45) {
      hints.push({
        id: 'plan_behind',
        label: `План ${String(planPct).replace('.', ',')}% — совет`,
        message: 'Что сделать сейчас, чтобы улучшить результат месяца?',
        tone: 'warn',
      })
    } else if (planPct >= 85) {
      hints.push({
        id: 'plan_strong',
        label: 'План в темпе',
        message: 'Как выполнен план продаж за этот месяц?',
        tone: 'ok',
      })
    } else {
      hints.push({
        id: 'plan_mid',
        label: `План ${String(planPct).replace('.', ',')}%`,
        message: 'Как выполнен план продаж за этот месяц?',
        tone: 'neutral',
      })
    }
  }

  if (reports === 0 && club) {
    hints.push({
      id: 'no_reports',
      label: 'Нет отчётов',
      message: 'Насколько заполнена база дневных отчётов менеджера за месяц?',
      tone: 'warn',
    })
  }

  hints.push({
    id: 'advice',
    label: 'Что делать',
    message: 'Что сделать сейчас, чтобы улучшить результат месяца?',
    tone: 'accent',
  })

  hints.push({
    id: 'risks',
    label: 'Риски',
    message: 'Какие главные риски и отклонения в цифрах за месяц?',
    tone: 'neutral',
  })

  const seen = new Set()
  return hints.filter((h) => {
    if (seen.has(h.id)) return false
    seen.add(h.id)
    return true
  }).slice(0, 5)
}

/** @param {Array<{ label: string }>} hints @param {number} [tick] */
export function pickRotatingHint(hints, tick = 0) {
  if (!hints?.length) return null
  const i = Math.abs(Math.trunc(tick)) % hints.length
  return hints[i]
}
