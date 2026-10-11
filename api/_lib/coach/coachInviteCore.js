/**
 * Одноразовые входы телефона тренера (таблица coach_invites, вид — kind).
 * QR с планшета (kind 'qr'): код виден на экране в зале, поэтому живёт 10 минут; первый открывший его телефон
 * закрепляется, другим он не подходит; закреплённый ждёт «Разрешить» админа до суток и гасится, как только выдан вход.
 * Вход значка iPhone (kind 'handoff'): Safari уже вошедшего телефона берёт его для значка «Домой» — у значка своё
 * хранилище. Выдаёт вход того же телефона (device_id), поэтому годится только с видом 'handoff'.
 */
export const COACH_INVITE_TTL_MS = 10 * 60 * 1000
export const COACH_INVITE_PAIRED_TTL_MS = 24 * 60 * 60 * 1000
export const COACH_HANDOFF_TTL_MS = 2 * 60 * 60 * 1000

export const COACH_INVITE_KIND_QR = 'qr'
export const COACH_INVITE_KIND_HANDOFF = 'handoff'

export const COACH_INVITE_GONE_RU = 'QR-код устарел — откройте на планшете меню → «Настройки» → «QR для телефона» ещё раз'
export const COACH_INVITE_ONLY_TRAINER_RU = 'QR для телефона — только у тренера'
export const COACH_HANDOFF_GONE_RU = 'Значок не смог войти сам — войдите по логину и паролю или по QR с планшета'

function isHandoff(invite) {
  return invite?.kind === COACH_INVITE_KIND_HANDOFF
}

function expired(invite, nowMs) {
  return !(Date.parse(String(invite.expires_at ?? '')) > nowMs)
}

/**
 * QR с планшета.
 * @param {{ kind?: string, device_id?: string | null, expires_at?: string, used_at?: string | null } | null} invite
 * @returns {'missing' | 'used' | 'other_device' | 'expired' | null}
 */
export function coachInviteDenial(invite, deviceId, nowMs) {
  if (!invite || isHandoff(invite)) return 'missing'
  if (invite.used_at) return 'used'
  if (invite.device_id && invite.device_id !== deviceId) return 'other_device'
  if (expired(invite, nowMs)) return 'expired'
  return null
}

/**
 * Вход значка: только вид 'handoff' с закреплённым телефоном.
 * @returns {'missing' | 'used' | 'expired' | null}
 */
export function coachHandoffDenial(invite, nowMs) {
  if (!invite || !isHandoff(invite) || !invite.device_id) return 'missing'
  if (invite.used_at) return 'used'
  if (expired(invite, nowMs)) return 'expired'
  return null
}
