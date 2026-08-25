/**
 * Общие правила входа (браузер + verify; сервер дублирует сообщения при необходимости).
 */
import { normalizeLoginInput } from './authLoginResolveCore.js'

export const SUPABASE_CLOUD_UNAVAILABLE_RU =
  'Облако базы не отвечает (таймаут). Сайт открывается, но база недоступна — вход и Sync не пройдут. ' +
  'Проверьте связь или статус облака у администратора. Данные на устройстве сохранены.'

export function isInvalidCredentialsMessage(msg) {
  return /invalid login|invalid credentials|invalid password|неверный логин|неверный пароль/i.test(
    String(msg ?? ''),
  )
}

export function isSupabaseTransportMessage(msg) {
  return /failed to fetch|networkerror|network request failed|load failed|connection reset|err_connection|timeout|aborted/i.test(
    String(msg ?? ''),
  )
}

/** Email-кандидаты для прямого Auth без lookup в public.users. */
export function buildDirectAuthEmailCandidates(raw) {
  const trimmed = normalizeLoginInput(raw)
  if (!trimmed) return []
  if (trimmed.includes('@')) return [trimmed]
  const n = trimmed.toLowerCase()
  // Тренер / менеджер / управляющий — разные synth-домены при создании учётки.
  return [`${n}@trainer.local`, `${n}@sales.local`, `${n}@club.local`]
}
