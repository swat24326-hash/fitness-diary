/**
 * Поиск боевых секретов в тексте (промпт, содержимое файла).
 * Основание: fitness-diary-security.mdc — service role и серверные ключи
 * не должны попадать в чат, логи и модель.
 *
 * Чистая логика — проверяется scripts/verify-hooks.mjs и scripts/verify-hooks-guards.mjs.
 * Ловим только однозначно опасное: anon key (role: anon) намеренно не считается секретом.
 */

const JWT = /eyJ[A-Za-z0-9_-]{8,}\.([A-Za-z0-9_-]{16,})\.[A-Za-z0-9_-]{8,}/g
// Значение не секрет: чтение из env в коде или заглушка из .env.example.
const NOT_A_VALUE = /^(process\.env|import\.meta|your[-_]|<|\$\{|x{3,}|\*{3,})|placeholder|changeme|[-_]here$|example/i

const SECRET_ASSIGNMENTS = [
  [/SERVICE_ROLE[_A-Z]*\s*[:=]\s*["']?([A-Za-z0-9._-]{20,})/i, 'ключ service_role в переменной'],
  [/\bsb_secret_[A-Za-z0-9_-]{10,}/, 'секретный ключ Supabase (sb_secret_)'],
  [/VAPID_PRIVATE_KEY\s*[:=]\s*["']?([A-Za-z0-9._-]{16,})/i, 'приватный ключ VAPID'],
  [/GEMINI_API_KEY\s*[:=]\s*["']?([A-Za-z0-9._-]{20,})/i, 'ключ Gemini API'],
  [/\bAIza[A-Za-z0-9_-]{30,}/, 'ключ Google API'],
  [/\bpostgres(?:ql)?:\/\/[^\s:/@]+:([^\s@]{6,})@/i, 'пароль в строке подключения к базе'],
  [/\b\d{8,10}:AA[A-Za-z0-9_-]{30,}/, 'токен Telegram-бота'],
  [/\b(?:AQVN[A-Za-z0-9_-]{30,}|y0_[A-Za-z0-9_-]{50,})/, 'ключ Yandex Cloud'],
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
    for (const match of source.matchAll(new RegExp(pattern.source, `${pattern.flags}g`))) {
      if (match[1] === undefined || !NOT_A_VALUE.test(match[1])) {
        found.add(label)
        break
      }
    }
  }

  return [...found]
}
