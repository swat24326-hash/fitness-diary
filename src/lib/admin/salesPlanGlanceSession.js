/**
 * Session TTL для виджета плана продаж на главной админа.
 * Цифры обычно меняются после дневного отчёта / правки плана — не на каждый remount.
 */
const PREFIX = 'fd-sales-plan-glance:v1:'
/** 2 часа: днём цифры стабильны; смена календарного дня — новый ключ. */
export const SALES_PLAN_GLANCE_TTL_MS = 2 * 60 * 60 * 1000

function storageKey(clubId, reportDate) {
  return `${PREFIX}${String(clubId ?? '').trim()}:${String(reportDate ?? '').slice(0, 10)}`
}

/**
 * @returns {{ payload: object, savedAt: number } | null}
 */
export function readSalesPlanGlanceSession(clubId, reportDate) {
  try {
    if (typeof sessionStorage === 'undefined') return null
    const raw = sessionStorage.getItem(storageKey(clubId, reportDate))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.payload || typeof parsed.savedAt !== 'number') return null
    return parsed
  } catch {
    return null
  }
}

export function writeSalesPlanGlanceSession(clubId, reportDate, payload) {
  try {
    if (typeof sessionStorage === 'undefined' || !payload) return
    sessionStorage.setItem(
      storageKey(clubId, reportDate),
      JSON.stringify({ payload, savedAt: Date.now() }),
    )
  } catch {
    /* quota */
  }
}

export function clearSalesPlanGlanceSession(clubId) {
  try {
    if (typeof sessionStorage === 'undefined') return
    const prefix = `${PREFIX}${String(clubId ?? '').trim()}:`
    const toRemove = []
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i)
      if (k && k.startsWith(prefix)) toRemove.push(k)
    }
    for (const k of toRemove) sessionStorage.removeItem(k)
  } catch {
    /* ignore */
  }
}

export function isSalesPlanGlanceFresh(savedAt, ttlMs = SALES_PLAN_GLANCE_TTL_MS) {
  return typeof savedAt === 'number' && Date.now() - savedAt < ttlMs
}
