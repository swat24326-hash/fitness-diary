/**
 * Локальные черновики отчётов продаж — переживают перезагрузку вкладки на планшете.
 */
export const SALES_DRAFT_STORAGE_VERSION = 1
export const SALES_DRAFT_PREFIX = `fit_sales_draft_v${SALES_DRAFT_STORAGE_VERSION}`

/** @param {unknown} value */
export function fingerprintJson(value) {
  return JSON.stringify(value)
}

/** @param {string} clubId @param {string} reportDate */
export function salesDailyDraftKey(clubId, reportDate) {
  return `${SALES_DRAFT_PREFIX}:${String(clubId).trim()}:daily:${String(reportDate).slice(0, 10)}`
}

/** @param {string} clubId @param {number} year @param {number} month */
export function salesPlanDraftKey(clubId, year, month) {
  return `${SALES_DRAFT_PREFIX}:${String(clubId).trim()}:plan:${year}-${String(month).padStart(2, '0')}`
}

/** @param {string} clubId @param {number} year @param {number} month */
export function salesFinanceDraftKey(clubId, year, month) {
  return `${SALES_DRAFT_PREFIX}:${String(clubId).trim()}:finance:${year}-${String(month).padStart(2, '0')}`
}

/**
 * @param {{ dailyForm: Record<string, string>, trainingsMatrix: Record<string, string>, aerobicMatrix: Record<string, string> }} p
 */
export function fingerprintDailyDraft({ dailyForm, trainingsMatrix, aerobicMatrix }) {
  return fingerprintJson({ dailyForm, trainingsMatrix, aerobicMatrix })
}

/** @param {Record<string, string>} planForm */
export function fingerprintPlanDraft(planForm) {
  return fingerprintJson(planForm)
}

/** @param {Record<string, string>} expenseForm */
export function fingerprintExpenseDraft(expenseForm) {
  return fingerprintJson(expenseForm)
}

/**
 * @param {Record<string, unknown> | null | undefined} draft
 * @param {string} serverFp
 */
export function shouldRestoreSalesDraft(draft, serverFp) {
  if (!draft || draft.v !== SALES_DRAFT_STORAGE_VERSION) return false
  if (String(draft.serverBaselineFp ?? '') !== String(serverFp ?? '')) return false
  if (String(draft.fingerprint ?? '') === String(serverFp ?? '')) return false
  return true
}

/**
 * @param {string} key
 * @returns {Record<string, unknown> | null}
 */
export function readSalesDraft(key) {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

/** @param {string} key @param {Record<string, unknown>} payload */
export function writeSalesDraft(key, payload) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(key, JSON.stringify(payload))
  } catch {
    /* quota / private mode */
  }
}

/** @param {string} key */
export function clearSalesDraft(key) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}

/**
 * @param {{
 *   serverBaselineFp: string,
 *   dailyForm: Record<string, string>,
 *   trainingsMatrix: Record<string, string>,
 *   aerobicMatrix: Record<string, string>,
 * }} p
 */
export function buildDailyDraftPayload({ serverBaselineFp, dailyForm, trainingsMatrix, aerobicMatrix }) {
  return {
    v: SALES_DRAFT_STORAGE_VERSION,
    savedAt: new Date().toISOString(),
    serverBaselineFp,
    fingerprint: fingerprintDailyDraft({ dailyForm, trainingsMatrix, aerobicMatrix }),
    dailyForm,
    trainingsMatrix,
    aerobicMatrix,
  }
}

/** @param {{ serverBaselineFp: string, planForm: Record<string, string> }} p */
export function buildPlanDraftPayload({ serverBaselineFp, planForm }) {
  return {
    v: SALES_DRAFT_STORAGE_VERSION,
    savedAt: new Date().toISOString(),
    serverBaselineFp,
    fingerprint: fingerprintPlanDraft(planForm),
    planForm,
  }
}

/** @param {{ serverBaselineFp: string, expenseForm: Record<string, string> }} p */
export function buildExpenseDraftPayload({ serverBaselineFp, expenseForm }) {
  return {
    v: SALES_DRAFT_STORAGE_VERSION,
    savedAt: new Date().toISOString(),
    serverBaselineFp,
    fingerprint: fingerprintExpenseDraft(expenseForm),
    expenseForm,
  }
}

/**
 * @param {{
 *   draft: Record<string, unknown> | null | undefined,
 *   serverFp: string,
 *   dailyForm: Record<string, string>,
 *   trainingsMatrix: Record<string, string>,
 *   aerobicMatrix: Record<string, string>,
 * }} p
 */
export function resolveDailyDraftAfterLoad({ draft, serverFp, dailyForm, trainingsMatrix, aerobicMatrix }) {
  if (!shouldRestoreSalesDraft(draft, serverFp)) {
    return { restored: false, dailyForm, trainingsMatrix, aerobicMatrix }
  }
  return {
    restored: true,
    dailyForm: draft.dailyForm && typeof draft.dailyForm === 'object' ? draft.dailyForm : dailyForm,
    trainingsMatrix:
      draft.trainingsMatrix && typeof draft.trainingsMatrix === 'object' ? draft.trainingsMatrix : trainingsMatrix,
    aerobicMatrix: draft.aerobicMatrix && typeof draft.aerobicMatrix === 'object' ? draft.aerobicMatrix : aerobicMatrix,
  }
}

/** @param {{ draft: Record<string, unknown> | null | undefined, serverFp: string, planForm: Record<string, string> }} p */
export function resolvePlanDraftAfterLoad({ draft, serverFp, planForm }) {
  if (!shouldRestoreSalesDraft(draft, serverFp)) {
    return { restored: false, planForm }
  }
  return {
    restored: true,
    planForm: draft.planForm && typeof draft.planForm === 'object' ? draft.planForm : planForm,
  }
}

/** @param {{ draft: Record<string, unknown> | null | undefined, serverFp: string, expenseForm: Record<string, string> }} p */
export function resolveExpenseDraftAfterLoad({ draft, serverFp, expenseForm }) {
  if (!shouldRestoreSalesDraft(draft, serverFp)) {
    return { restored: false, expenseForm }
  }
  return {
    restored: true,
    expenseForm: draft.expenseForm && typeof draft.expenseForm === 'object' ? draft.expenseForm : expenseForm,
  }
}

/**
 * @param {string} serverFp
 * @param {string} currentFp
 */
export function shouldPersistSalesDraft(serverFp, currentFp) {
  return Boolean(serverFp) && currentFp !== serverFp
}
