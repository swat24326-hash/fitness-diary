/**
 * QR с планшета тренера → вход на телефоне. Ссылку видно на экране в зале, поэтому:
 * живёт 10 минут; первый открывший её телефон закрепляется, другим она не подходит;
 * закреплённая ждёт «Разрешить» админа до суток и гасится, как только выдан вход.
 */
export const COACH_INVITE_TTL_MS = 10 * 60 * 1000
export const COACH_INVITE_PAIRED_TTL_MS = 24 * 60 * 60 * 1000

export const COACH_INVITE_GONE_RU = 'QR-код устарел — откройте на планшете меню → «Настройки» → «QR для телефона» ещё раз'
export const COACH_INVITE_ONLY_TRAINER_RU = 'QR для телефона — только у тренера'

/**
 * @param {{ device_id?: string | null, expires_at?: string, used_at?: string | null } | null} invite
 * @param {string} deviceId
 * @param {number} nowMs
 * @returns {'missing' | 'used' | 'other_device' | 'expired' | null}
 */
export function coachInviteDenial(invite, deviceId, nowMs) {
  if (!invite) return 'missing'
  if (invite.used_at) return 'used'
  if (invite.device_id && invite.device_id !== deviceId) return 'other_device'
  if (!(Date.parse(String(invite.expires_at ?? '')) > nowMs)) return 'expired'
  return null
}
