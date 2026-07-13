/** Быстрые кнопки ИСКРЫ — дефолт из кода, переопределение на клуб в club_iskra_settings.quick_chips. */

import {
  GEMINI_INSTANT_CHIPS,
  GEMINI_QUICK_CHIPS,
  GEMINI_TRAINER_QUICK_CHIPS,
  matchGeminiInstantChip,
  normalizeGeminiChipMessage,
} from './geminiInstantReplies.js'
import { mapAppRoleToAdvisorRole } from './iskraAdvisorScope.js'
import { resolveIskraAdvisorRole, iskraAdvisorFullAccess } from './iskraAdvisorRoles.js'

export const ISKRA_QUICK_CHIP_LIMITS = {
  maxChips: 12,
  minLabel: 1,
  maxLabel: 40,
  minMessage: 3,
  maxMessage: 500,
}

/** @type {Set<string>} */
export const ISKRA_BUILTIN_HANDLER_IDS = new Set(GEMINI_INSTANT_CHIPS.map((c) => c.id))

/**
 * @typedef {{
 *   id: string,
 *   label: string,
 *   message: string,
 *   compare?: boolean,
 *   handler_id?: string | null,
 * }} IskraQuickChip
 */

/** @returns {IskraQuickChip[]} */
export function defaultIskraTrainerQuickChips() {
  return GEMINI_TRAINER_QUICK_CHIPS.map((chip) => ({
    id: chip.id,
    label: chip.label,
    message: chip.message,
    compare: chip.compare === true,
    handler_id: chip.id,
  }))
}

/**
 * Кнопки панели по сегменту (продажи / тренеры) и роли.
 * @param {{ stored?: unknown, segment?: string, trainerId?: string | null, appRole?: string }} opts
 * @returns {IskraQuickChip[]}
 */
export function resolvePanelQuickChips(opts = {}) {
  const segment = String(opts.segment ?? '').trim()
  const trainerId = String(opts.trainerId ?? '').trim()
  if (segment === 'trainer' || trainerId) return defaultIskraTrainerQuickChips()

  const stored = resolveIskraQuickChips(opts.stored)
  const appRole = String(opts.appRole ?? '').trim()
  if (!appRole) return stored

  const role = resolveIskraAdvisorRole(mapAppRoleToAdvisorRole(appRole))
  if (iskraAdvisorFullAccess(role)) {
    return stored.length ? stored : defaultIskraQuickChips()
  }
  const allowed = new Set(role.defaultChipIds)
  const filtered = stored.filter((chip) => {
    const handler = String(chip.handler_id ?? chip.id ?? '').trim()
    return allowed.has(handler)
  })
  if (filtered.length >= 4) return filtered

  const byId = new Map(stored.map((c) => [String(c.handler_id ?? c.id), c]))
  const merged = []
  for (const id of role.defaultChipIds) {
    const chip = byId.get(id) ?? defaultIskraQuickChips().find((c) => (c.handler_id ?? c.id) === id)
    if (chip && !merged.some((m) => (m.handler_id ?? m.id) === id)) merged.push(chip)
  }
  return merged.length ? merged : stored
}

/** @returns {IskraQuickChip[]} */
export function defaultIskraQuickChips() {
  return GEMINI_QUICK_CHIPS.map((chip) => ({
    id: chip.id,
    label: chip.label,
    message: chip.message,
    compare: chip.compare === true,
    handler_id: chip.id,
  }))
}

/** @returns {Array<{ id: string, label: string }>} */
export function iskraBuiltinHandlerOptions() {
  return GEMINI_INSTANT_CHIPS.map((chip) => ({
    id: chip.id,
    label: chip.label,
  }))
}

/**
 * @param {unknown} raw
 * @param {number} index
 * @returns {IskraQuickChip | null}
 */
export function normalizeIskraQuickChip(raw, index = 0) {
  if (!raw || typeof raw !== 'object') return null
  const row = /** @type {Record<string, unknown>} */ (raw)
  const label = String(row.label ?? '').trim()
  const message = String(row.message ?? '').trim()
  if (!label || !message) return null

  let id = String(row.id ?? '').trim()
  if (!id) id = `chip_${index + 1}`

  const handlerRaw = row.handler_id
  const handler_id =
    handlerRaw == null || handlerRaw === ''
      ? null
      : String(handlerRaw).trim() || null

  if (handler_id && !ISKRA_BUILTIN_HANDLER_IDS.has(handler_id)) return null

  return {
    id: id.slice(0, 64),
    label: label.slice(0, ISKRA_QUICK_CHIP_LIMITS.maxLabel),
    message: message.slice(0, ISKRA_QUICK_CHIP_LIMITS.maxMessage),
    compare: row.compare === true,
    handler_id,
  }
}

/**
 * @param {unknown} stored
 * @returns {IskraQuickChip[]}
 */
export function resolveIskraQuickChips(stored) {
  if (!Array.isArray(stored) || stored.length === 0) return defaultIskraQuickChips()

  const out = []
  const seen = new Set()
  for (let i = 0; i < stored.length && out.length < ISKRA_QUICK_CHIP_LIMITS.maxChips; i++) {
    const chip = normalizeIskraQuickChip(stored[i], i)
    if (!chip || seen.has(chip.id)) continue
    seen.add(chip.id)
    out.push(chip)
  }

  return out.length ? out : defaultIskraQuickChips()
}

/**
 * @param {unknown} chips
 * @returns {{ ok: true, chips: IskraQuickChip[] } | { ok: false, error: string }}
 */
export function validateIskraQuickChipsForSave(chips) {
  if (chips == null) return { ok: true, chips: defaultIskraQuickChips() }

  if (!Array.isArray(chips)) {
    return { ok: false, error: 'quick_chips должен быть массивом' }
  }

  if (chips.length === 0) {
    return { ok: true, chips: defaultIskraQuickChips() }
  }

  if (chips.length > ISKRA_QUICK_CHIP_LIMITS.maxChips) {
    return { ok: false, error: `Не больше ${ISKRA_QUICK_CHIP_LIMITS.maxChips} кнопок` }
  }

  const out = []
  const seen = new Set()

  for (let i = 0; i < chips.length; i++) {
    const chip = normalizeIskraQuickChip(chips[i], i)
    if (!chip) {
      return { ok: false, error: `Кнопка ${i + 1}: укажите подпись и текст вопроса` }
    }
    if (chip.label.length < ISKRA_QUICK_CHIP_LIMITS.minLabel) {
      return { ok: false, error: `Кнопка «${chip.label}»: слишком короткая подпись` }
    }
    if (chip.message.length < ISKRA_QUICK_CHIP_LIMITS.minMessage) {
      return { ok: false, error: `Кнопка «${chip.label}»: вопрос короче ${ISKRA_QUICK_CHIP_LIMITS.minMessage} символов` }
    }
    if (seen.has(chip.id)) {
      return { ok: false, error: `Повтор id кнопки: ${chip.id}` }
    }
    seen.add(chip.id)
    out.push(chip)
  }

  return { ok: true, chips: out }
}

/**
 * @param {IskraQuickChip[]} quickChips
 * @param {string} userMessage
 */
export function comparePreviousFromQuickChips(quickChips, userMessage) {
  const normalized = normalizeGeminiChipMessage(userMessage)
  for (const chip of quickChips) {
    if (normalizeGeminiChipMessage(chip.message) !== normalized) continue
    return chip.compare === true
  }
  return false
}

/**
 * @param {{
 *   userMessage: string,
 *   comparePrevious?: boolean,
 *   quickChips?: unknown,
 *   handlerId?: string | null,
 * }} opts
 * @returns {string | null}
 */
export function resolveInstantHandlerId(opts) {
  const comparePrevious = opts.comparePrevious === true
  const explicit = String(opts.handlerId ?? '').trim()

  if (explicit && ISKRA_BUILTIN_HANDLER_IDS.has(explicit)) {
    if (explicit === 'compare' && !comparePrevious) return null
    return explicit
  }

  const chips = resolveIskraQuickChips(opts.quickChips)
  const normalized = normalizeGeminiChipMessage(opts.userMessage)

  for (const chip of chips) {
    if (normalizeGeminiChipMessage(chip.message) !== normalized) continue
    if (chip.compare && !comparePrevious) return null
    const handler = String(chip.handler_id ?? '').trim()
    if (handler && ISKRA_BUILTIN_HANDLER_IDS.has(handler)) {
      if (handler === 'compare' && !comparePrevious) return null
      return handler
    }
    return null
  }

  return matchGeminiInstantChip(opts.userMessage, comparePrevious)
}

/**
 * @param {unknown} stored
 * @returns {IskraQuickChip[] | null} null = использовать дефолт (не сохранено на клуб)
 */
export function parseStoredQuickChips(stored) {
  if (stored == null) return null
  if (!Array.isArray(stored)) return null
  if (stored.length === 0) return null
  return resolveIskraQuickChips(stored)
}
