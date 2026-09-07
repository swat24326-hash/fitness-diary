/**
 * Разбор shell-команды для guard-хука: сегменты и подкоманда git.
 * Без внешних зависимостей — хук стартует на каждую команду.
 */

/** Делит строку на отдельные команды по &&, ||, ;, | */
export function splitSegments(command) {
  return String(command || '')
    .split(/&&|\|\||;|\|/)
    .map((part) => part.trim())
    .filter(Boolean)
}

const GIT_TOKEN = /(^|[\\/])git(\.exe)?$/i
const FLAG_WITH_VALUE = /^-(C|c|-git-dir|-work-tree|-exec-path)$/i

/**
 * Возвращает подкоманду git ('commit', 'push', …) или null.
 * Понимает `git -C path commit`, `git --no-pager push`.
 */
export function gitSubcommand(segment) {
  const tokens = String(segment || '').split(/\s+/).filter(Boolean)
  const gitAt = tokens.findIndex((token) => GIT_TOKEN.test(token.replace(/^["']|["']$/g, '')))
  if (gitAt === -1) return null

  for (let i = gitAt + 1; i < tokens.length; i += 1) {
    const token = tokens[i]
    if (FLAG_WITH_VALUE.test(token)) {
      i += 1
      continue
    }
    if (token.startsWith('-')) continue
    return token.toLowerCase()
  }
  return null
}
