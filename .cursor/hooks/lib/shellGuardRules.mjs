/**
 * Какие команды требуют подтверждения владельца.
 * Чистая логика без ввода-вывода — проверяется scripts/verify-hooks.mjs.
 *
 * Основание: fitness-diary-ship.mdc («заливай» = весь цикл без карточек на каждом шаге)
 * и fitness-diary-stability.mdc (не ломать прод зала).
 * commit / push / vercel не спрашиваем: владелец уже сказал «заливай» в чате.
 * Опасное (reset, миграции, rm) — по-прежнему карточка.
 */

import { splitSegments, gitSubcommand } from './shellCommand.mjs'

const GIT_ASK = {
  reset: 'git reset может затереть незакоммиченные правки.',
  clean: 'git clean удаляет файлы без корзины.',
  checkout: 'git checkout может затереть незакоммиченные правки.',
  restore: 'git restore затирает незакоммиченные правки.',
  rebase: 'git rebase перезаписывает историю.',
  merge: 'git merge меняет содержимое ветки.',
  revert: 'git revert добавляет коммит с откатом.',
}

const PATTERN_ASK = [
  [/\bnpm\s+run\s+db:migrate/i, 'Миграция меняет схему прод-базы Supabase.'],
  [/\bnode\s+\S*scripts[\\/]+apply-/i, 'Скрипт apply-* применяет миграцию к прод-базе.'],
  [/\bnode\s+\S*scripts[\\/]+pg-migrate/i, 'Скрипт применяет миграции к базе.'],
  [/\bsupabase\s+db\b/i, 'Команда supabase db меняет прод-базу.'],
  [/\bpsql\b/i, 'Прямое подключение psql пишет в базу.'],
  [/\bgh\s+(pr|release|repo|api|workflow|run)\b/i, 'Команда gh меняет данные в GitHub.'],
  [/\bnpm\s+run\s+qa(?!:local\b)(?![:\w])/i, 'npm run qa без --skip-prod работает с прод-данными.'],
  [/\bnpm\s+run\s+qa:(roles|deep)/i, 'Этот QA-сценарий пишет и чистит данные на проде.'],
  [/\bnode\s+\S*scripts[\\/]+qa-\S*prod/i, 'Прод-QA скрипт создаёт и удаляет данные на проде.'],
  [/\brm\s+-rf?\b/i, 'Рекурсивное удаление файлов.'],
  [/Remove-Item\b(?=[^\n]*-Recurse)/i, 'Рекурсивное удаление файлов.'],
  [/\bnpm\s+(uninstall|prune)\b/i, 'Команда меняет зависимости проекта.'],
]

/**
 * @param {string} command полная строка терминальной команды
 * @returns {{ ask: boolean, reason: string|null }}
 */
export function classifyShellCommand(command) {
  for (const segment of splitSegments(command)) {
    const sub = gitSubcommand(segment)
    if (sub && GIT_ASK[sub]) return { ask: true, reason: GIT_ASK[sub] }

    for (const [pattern, reason] of PATTERN_ASK) {
      if (pattern.test(segment)) return { ask: true, reason }
    }
  }
  return { ask: false, reason: null }
}
