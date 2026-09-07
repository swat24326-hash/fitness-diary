/**
 * Хук beforeSubmitPrompt: не отправлять в модель сообщение с боевым секретом.
 * Утечка service role = полный доступ к базе клуба в обход RLS.
 */

import { runHook } from './lib/hookIo.mjs'
import { findSecrets } from './lib/secretScan.mjs'

runHook((input) => {
  const found = findSecrets(input.prompt)
  if (found.length === 0) return { continue: true }

  return {
    continue: false,
    user_message: [
      `В сообщении найден секрет: ${found.join(', ')}.`,
      'Отправка отменена — такой ключ нельзя показывать ИИ и хранить в истории чата.',
      'Уберите ключ из текста. Если он уже был где-то вставлен раньше — смените его в Supabase / Vercel.',
    ].join(' '),
  }
}, { continue: true })
