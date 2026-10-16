/**
 * Токен входа телефона тренера из QR (без React).
 * Планшет: buildCoachJoinUrl → /coach/join#t=…; значок iPhone: /coach/?h=…
 */
import { coachQrTokenFromHash } from './coachJoinLink.js'

const QR_RE = /^[A-Za-z0-9_-]{16,128}$/
const HANDOFF_RE = /^[A-Za-z0-9_-]{20,64}$/

/**
 * @returns {{ kind: 'qr' | 'handoff', token: string } | null}
 */
export function coachInviteScanFromRaw(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return null
  if (QR_RE.test(s) && !/[/?#]/.test(s)) return { kind: 'qr', token: s }
  try {
    const u = new URL(s, 'https://local.invalid')
    const fromHash = coachQrTokenFromHash(u.hash)
    if (fromHash) return { kind: 'qr', token: fromHash }
    const h = String(u.searchParams.get('h') ?? '').trim()
    if (HANDOFF_RE.test(h)) return { kind: 'handoff', token: h }
    const pathT = String(u.searchParams.get('t') ?? '').trim()
    if (QR_RE.test(pathT)) return { kind: 'qr', token: pathT }
  } catch {
    /* не URL */
  }
  const hashMatch = s.match(/#t=([A-Za-z0-9_-]{16,128})/)
  if (hashMatch) return { kind: 'qr', token: hashMatch[1] }
  const hMatch = s.match(/[?&]h=([A-Za-z0-9_-]{20,64})/)
  if (hMatch) return { kind: 'handoff', token: hMatch[1] }
  return null
}

/** Только токен QR с планшета (для простых проверок). */
export function coachInviteTokenFromScan(raw) {
  const r = coachInviteScanFromRaw(raw)
  return r?.kind === 'qr' ? r.token : r?.kind === 'handoff' ? r.token : ''
}
