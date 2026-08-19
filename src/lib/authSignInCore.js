/**
 * Общие правила входа (браузер + verify; сервер дублирует сообщения при необходимости).
 */
import { normalizeLoginInput, trainerLocalEmail } from './authLoginResolveCore.js'

export const SUPABASE_CLOUD_UNAVAILABLE_RU =
  'Облако Supabase не отвечает (таймаут). Сайт открывается, но база недоступна — вход и Sync не пройдут. ' +
  'Проверьте status.supabase.com или перезапустите проект в Supabase Dashboard. Данные на устройстве сохранены.'

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
  const synth = trainerLocalEmail(trimmed)
  return synth ? [synth] : []
}
