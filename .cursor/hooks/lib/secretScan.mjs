/**
 * Поиск боевых секретов в тексте (промпт, содержимое файла).
 * Основание: fitness-diary-security.mdc — service role и серверные ключи
 * не должны попадать в чат, логи и модель.
 *
 * Чистая логика — проверяется scripts/verify-hooks-secret-scan.mjs.
 * Ловим только однозначно опасное: anon key (role: anon) намеренно не считается секретом.
 */

const JWT = /eyJ[A-Za-z0-9_-]{8,}\.([A-Za-z0-9_-]{16,})\.[A-Za-z0-9_-]{8,}/g
const SECRET_ASSIGNMENTS = [
  [/SERVICE_ROLE[_A-Z]*\s*[:=]\s*["']?([A-Za-z0-9._-]{20,})/i, 'ключ service_role в переменной'],
  [/\bsb_secret_[A-Za-z0-9_-]{10,}/, 'секретный ключ Supabase (sb_secret_)'],
  [/VAPID_PRIVATE_KEY\s*[:=]\s*["']?([A-Za-z0-9._-]{16,})/i, 'приватный ключ VAPID'],
  [/GEMINI_API_KEY\s*[:=]\s*["']?([A-Za-z0-9._-]{20,})/i, 'ключ Gemini API'],
  [/\bAIza[A-Za-z0-9_-]{30,}/, 'ключ Google API'],
]

function payloadHasServiceRole(payloadPart) {
  try {
    const json = Buffer.from(payloadPart.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    return /"role"\s*:\s*"service_role"/.test(json)
  } catch {
    return false
  }
}

/**
 * @param {string} text
 * @returns {string[]} список того, что нашли (пусто — чисто)
 */
export function findSecrets(text) {
  const source = String(text || '')
  const found = new Set()

  for (const match of source.matchAll(JWT)) {
    if (payloadHasServiceRole(match[1])) found.add('JWT с ролью service_role')
  }

  for (const [pattern, label] of SECRET_ASSIGNMENTS) {
    if (pattern.test(source)) found.add(label)
  }

  return [...found]
}
