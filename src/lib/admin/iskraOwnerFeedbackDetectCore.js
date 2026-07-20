/**
 * Detect owner feedback from free-text chat (not only 👍 / settings).
 * Pure functions — verify-iskra-learning.mjs / verify-iskra-owner-feedback.mjs.
 */

/**
 * @typedef {{
 *   kind: 'style_compact' | 'style_deep' | 'course_stop' | 'course_shift' | 'remember',
 *   note: string,
 *   signal_key: string,
 * }} IskraOwnerFeedbackHit
 */

const STYLE_COMPACT_RE = /(?:^|[.!?…,\s])(короче|кратко|без\s+воды|не\s+размазывай|покороче|сжато)(?:[.!?…,\s]|$)/i
const STYLE_DEEP_RE = /(?:^|[.!?…,\s])(подробнее|глубже|разверни|с\s+деталями|не\s+кратко)(?:[.!?…,\s]|$)/i
const COURSE_STOP_RE =
  /(?:^|[.!?…,\s])(не\s+то|не\s+туда|не\s+про\s+это|мимо|не\s+в\s+ту\s+сторону|хватит\s+про)(?:[.!?…,\s]|$)/i
const REMEMBER_RE = /запомн(?:и|ите)(?:\s*[:\-—–]\s*|\s+)(.{8,200})/i
const COURSE_SHIFT_RE =
  /(?:теперь|дальше|сейчас)\s+(?:важнее|нужно|фокус(?:\s+на)?|про)\s+(.{4,120})/i

/**
 * @param {string} message
 * @returns {IskraOwnerFeedbackHit[]}
 */
export function detectOwnerFeedbackFromMessage(message) {
  const s = String(message ?? '').trim()
  if (!s || s.length < 4) return []

  /** @type {IskraOwnerFeedbackHit[]} */
  const hits = []

  const remember = s.match(REMEMBER_RE)
  if (remember?.[1]) {
    const note = String(remember[1]).trim().replace(/[.!?…]+$/, '')
    if (note.length >= 8) {
      hits.push({
        kind: 'remember',
        note: `Владелец просит помнить: ${note}`,
        signal_key: 'owner:remember',
      })
    }
  }

  const shift = s.match(COURSE_SHIFT_RE)
  if (shift?.[1]) {
    const focus = String(shift[1]).trim().replace(/[.!?…]+$/, '')
    if (focus.length >= 4) {
      hits.push({
        kind: 'course_shift',
        note: `Новый фокус владельца: ${focus}`,
        signal_key: 'owner:focus',
      })
    }
  }

  if (COURSE_STOP_RE.test(s)) {
    hits.push({
      kind: 'course_stop',
      note: 'Владелец сказал, что курс ответа неверный — сменить тему/подход и уточнить приоритет.',
      signal_key: 'owner:course',
    })
  }

  if (STYLE_COMPACT_RE.test(s)) {
    hits.push({
      kind: 'style_compact',
      note: 'Стиль: короче, без воды, сначала суть.',
      signal_key: 'owner:style',
    })
  } else if (STYLE_DEEP_RE.test(s)) {
    hits.push({
      kind: 'style_deep',
      note: 'Стиль: подробнее, с деталями и шагами.',
      signal_key: 'owner:style',
    })
  }

  // One hit per signal_key (last wins for style; remember/focus keep)
  const byKey = new Map()
  for (const hit of hits) byKey.set(hit.signal_key, hit)
  return [...byKey.values()]
}

/**
 * @param {IskraOwnerFeedbackHit[]} hits
 */
export function buildOwnerFeedbackPromptAppend(hits) {
  const list = Array.isArray(hits) ? hits : []
  if (!list.length) return ''
  const lines = list.slice(0, 4).map((h) => `· ${h.note}`)
  return (
    'ПРАВКИ ВЛАДЕЛЬЦА ИЗ ДИАЛОГА (соблюдай в этом и следующих ответах, не противоречь без пометки): ' +
    lines.join(' ')
  )
}

/**
 * Map a hit to a learning event payload (client or server).
 * @param {IskraOwnerFeedbackHit} hit
 * @param {{ clubId: string, advisorRoleId?: string, userMessage?: string }} ctx
 */
export function ownerFeedbackHitToLearningEvent(hit, ctx) {
  const clubId = String(ctx.clubId ?? '').trim()
  if (!clubId || !hit?.note) return null
  return {
    club_id: clubId,
    event_type: 'preference',
    signal_key: hit.signal_key,
    advisor_role_id: String(ctx.advisorRoleId ?? 'app_admin').trim() || 'app_admin',
    user_message: String(ctx.userMessage ?? '').trim().slice(0, 500),
    note: hit.note.slice(0, 500),
    created_at: new Date().toISOString(),
    meta: { source: 'nl_detect', kind: hit.kind },
  }
}
