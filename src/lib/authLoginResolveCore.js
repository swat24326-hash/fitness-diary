/**
 * Нормализация логина и извлечение email для входа (браузер и /api/auth-sign-in).
 */

export function normalizeLoginInput(raw) {
  return String(raw ?? '')
    .replace(/[\u200b-\u200d\ufeff]/g, '')
    .replace(/\u00a0/g, ' ')
    .trim()
}

export function trainerLocalEmail(login) {
  const n = normalizeLoginInput(login).toLowerCase()
  if (!n || n.includes('@')) return ''
  return `${n}@trainer.local`
}

/**
 * @param {{ email?: string | null, is_active?: boolean | null } | null | undefined} row
 * @param {string} login
 * @returns {{ email: string, isActive: boolean } | null}
 */
export function emailFromLoginRow(row, login) {
  if (!row) return null
  const direct = String(row.email ?? '').trim()
  if (direct) {
    return { email: direct, isActive: row.is_active !== false }
  }
  const synth = trainerLocalEmail(login)
  if (synth) {
    return { email: synth, isActive: row.is_active !== false }
  }
  return null
}

/**
 * @param {string} login
 * @returns {string[]}
 */
export function loginLookupEmails(login) {
  const trimmed = normalizeLoginInput(login)
  if (!trimmed) return []
  if (trimmed.includes('@')) return [trimmed]
  const synth = trainerLocalEmail(trimmed)
  return synth ? [synth] : []
}
