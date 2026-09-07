/**
 * Хук beforeShellExecution: необратимые команды — только с подтверждением владельца.
 * Всё остальное пропускаем без вопросов.
 */

import { runHook } from './lib/hookIo.mjs'
import { classifyShellCommand } from './lib/shellGuardRules.mjs'

runHook((input) => {
  const { ask, reason } = classifyShellCommand(input.command)
  if (!ask) return { permission: 'allow' }

  return {
    permission: 'ask',
    user_message: `Подтвердите команду: ${reason}`,
    agent_message: `Хук проекта требует подтверждения владельца: ${reason} Не запускай повторно без разрешения.`,
  }
}, { permission: 'allow' })
