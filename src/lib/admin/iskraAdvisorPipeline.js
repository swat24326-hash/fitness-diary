/**
 * Пайплайн советника ИСКРЫ: роль → scope → советы → чипы → промпт.
 */

import { resolveIskraAdvisorRole, iskraAdvisorFullAccess } from './iskraAdvisorRoles.js'
import { mapAppRoleToAdvisorRole, filterSnapshotForAdvisorRole } from './iskraAdvisorScope.js'
import { buildIskraAdviceSummary } from './iskraBusinessAdvice.js'
import { defaultIskraQuickChips, resolveIskraQuickChips } from './iskraQuickChipsCore.js'

/**
 * @typedef {{
 *   appRole: string,
 *   advisorRoleId: import('./iskraAdvisorRoles.js').IskraAdvisorRoleId,
 *   role: import('./iskraAdvisorRoles.js').IskraAdvisorRoleDef,
 *   snapshot: object | null | undefined,
 *   adviceSummary: ReturnType<typeof buildIskraAdviceSummary>,
 * }} IskraAdvisorContext
 */

/**
 * @param {{
 *   appRole?: string,
 *   snapshot?: object | null,
 *   storedQuickChips?: unknown,
 *   adviceLimit?: number,
 * }} opts
 * @returns {IskraAdvisorContext}
 */
export function buildIskraAdvisorContext(opts = {}) {
  const appRole = String(opts.appRole ?? 'admin').trim() || 'admin'
  const advisorRoleId = mapAppRoleToAdvisorRole(appRole)
  const role = resolveIskraAdvisorRole(advisorRoleId)
  const rawSnapshot = opts.snapshot ?? null
  const snapshot = rawSnapshot ? filterSnapshotForAdvisorRole(rawSnapshot, advisorRoleId) : null
  const adviceLimit = Math.max(1, Number(opts.adviceLimit) || 3)
  const adviceSummary = buildIskraAdviceSummary(snapshot, { advisorRoleId, limit: adviceLimit })

  return {
    appRole,
    advisorRoleId,
    role,
    snapshot,
    adviceSummary,
  }
}

/**
 * @param {IskraAdvisorContext} ctx
 */
export function buildAdvisorPromptAppend(ctx) {
  const role = ctx.role
  const lines = [
    `РОЛЬ СОВЕТНИКА: ${role.labelRu} — ${role.personaFocus}`,
  ]
  if (iskraAdvisorFullAccess(role)) {
    lines.push(
      'Полный доступ: бизнес-цифры, советы, техподдержка приложения — отвечай строго по теме вопроса.',
    )
  } else {
    lines.push('Давай не только цифры, но и 1–2 конкретных шага.')
  }
  lines.push(
    'Советы из advisor_advice — приоритетные; не противоречь им без пометки «Оценка ИСКРЫ».',
  )
  if (ctx.adviceSummary?.cards?.length) {
    const top = ctx.adviceSummary.cards
      .slice(0, 2)
      .map((c) => `${c.headline}: ${c.action}`)
      .join('; ')
    lines.push(`Текущие приоритеты: ${top}.`)
  }
  return lines.join(' ')
}

/**
 * @param {IskraAdvisorContext} ctx
 * @param {unknown} [storedQuickChips]
 */
export function resolveAdvisorQuickChips(ctx, storedQuickChips) {
  const role = ctx.role
  const stored = resolveIskraQuickChips(storedQuickChips)
  const base = stored.length ? stored : defaultIskraQuickChips()
  const allowed = new Set(role.defaultChipIds)
  const filtered = base.filter((chip) => {
    const handler = String(chip.handler_id ?? chip.id ?? '').trim()
    return allowed.has(handler)
  })
  if (filtered.length >= 4) return filtered

  const byId = new Map(base.map((c) => [String(c.handler_id ?? c.id), c]))
  const merged = []
  for (const id of role.defaultChipIds) {
    const chip = byId.get(id)
    if (chip && !merged.some((m) => (m.handler_id ?? m.id) === id)) merged.push(chip)
  }
  return merged.length ? merged : base
}

/**
 * @param {IskraAdvisorContext} ctx
 */
export function buildAdvisorMetaForResponse(ctx) {
  return {
    advisor_role_id: ctx.advisorRoleId,
    advisor_role_label: ctx.role.labelRu,
    advice_card_count: ctx.adviceSummary?.cards?.length ?? 0,
  }
}
