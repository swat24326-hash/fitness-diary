/**
 * Обучение ИСКРЫ по неделанию: dismiss брифа, игнор карточек.
 * scripts/verify-iskra-inaction.mjs
 */

import { buildLearningSignalKey } from './iskraLearningCore.js'

export const ISKRA_INACTION_DISMISS_THRESHOLD = 3

/**
 * @param {'spark_brief' | 'insight_card' | 'alert' | 'checklist'} kind
 * @param {string} [id]
 */
export function buildInactionSignalKey(kind, id = 'general') {
  return buildLearningSignalKey('inaction', `${kind}_${id || 'general'}`)
}

/**
 * @param {{
 *   clubId: string,
 *   kind: 'spark_brief' | 'insight_card' | 'alert' | 'checklist',
 *   targetId?: string,
 *   note?: string,
 *   advisorRoleId?: string,
 * }} opts
 */
export function buildInactionDismissEvent(opts) {
  const clubId = String(opts.clubId ?? '').trim()
  const kind = String(opts.kind ?? '').trim()
  if (!clubId || !kind) return null
  const targetId = String(opts.targetId ?? 'general').trim() || 'general'
  const note =
    String(opts.note ?? '').trim() ||
    (kind === 'spark_brief'
      ? 'Владелец закрыл утренний бриф — не навязывать тот же CTA.'
      : `Владелец проигнорировал/закрыл «${targetId}» — реже такие советы.`)

  return {
    club_id: clubId,
    event_type: 'inaction_dismiss',
    signal_key: buildInactionSignalKey(kind, targetId),
    advisor_role_id: String(opts.advisorRoleId ?? 'app_admin').trim() || 'app_admin',
    user_message: '',
    note: note.slice(0, 500),
    created_at: new Date().toISOString(),
    meta: { source: 'inaction', kind, target_id: targetId },
  }
}

/**
 * После N dismiss → урок «реже советовать».
 * @param {{ signal_key?: string, negative_count?: number, playbook_note?: string, playbook_confirmed?: boolean }} signal
 */
export function shouldPromoteInactionLesson(signal) {
  if (!signal || signal.playbook_confirmed) return false
  return (Number(signal.negative_count) || 0) >= ISKRA_INACTION_DISMISS_THRESHOLD
}

/**
 * @param {Array<{ signal_key?: string, negative_count?: number, playbook_note?: string, playbook_confirmed?: boolean }>} signals
 */
export function extractInactionLessons(signals) {
  const out = []
  for (const s of signals ?? []) {
    const key = String(s.signal_key ?? '')
    if (!key.startsWith('inaction:')) continue
    if (!shouldPromoteInactionLesson(s) && !String(s.playbook_note ?? '').trim()) continue
    const note =
      String(s.playbook_note ?? '').trim() ||
      `Тема «${key}» часто закрывают без действия — предлагай реже или иначе.`
    out.push({ signal_key: key, note })
  }
  return out.slice(0, 4)
}

/**
 * @param {Array<{ signal_key: string, note: string }>} lessons
 */
export function buildInactionPromptAppend(lessons) {
  const list = Array.isArray(lessons) ? lessons : []
  if (!list.length) return ''
  const lines = list.slice(0, 3).map((l) => `· ${l.note}`)
  return `НЕДЕЛАНИЕ ВЛАДЕЛЬЦА (уважай, не долби теми же советами): ${lines.join(' ')}`
}

/**
 * Локальный счётчик показов карточки без клика (клиент).
 * @param {string} clubId
 * @param {string} cardId
 * @param {number} [delta]
 */
export function bumpInsightCardIgnoreCount(clubId, cardId, delta = 1) {
  if (typeof localStorage === 'undefined') return 0
  const c = String(clubId ?? '').trim()
  const id = String(cardId ?? '').trim()
  if (!c || !id) return 0
  const key = `fitness-diary-iskra-ignore-${c}-${id}`
  const prev = Number(localStorage.getItem(key)) || 0
  const next = Math.max(0, prev + delta)
  try {
    localStorage.setItem(key, String(next))
  } catch {
    /* quota */
  }
  return next
}

/**
 * @param {string} clubId
 * @param {string} cardId
 */
export function readInsightCardIgnoreCount(clubId, cardId) {
  if (typeof localStorage === 'undefined') return 0
  const key = `fitness-diary-iskra-ignore-${String(clubId).trim()}-${String(cardId).trim()}`
  return Number(localStorage.getItem(key)) || 0
}

/**
 * @param {string} clubId
 * @param {string} cardId
 */
export function clearInsightCardIgnoreCount(clubId, cardId) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.removeItem(
      `fitness-diary-iskra-ignore-${String(clubId).trim()}-${String(cardId).trim()}`,
    )
  } catch {
    /* ignore */
  }
}
