/**
 * R3: перенос паролей из Supabase Auth (auth.users.encrypted_password, bcrypt) в users.password_hash.
 * Без базы: план обновлений; запись делает scripts/r3-import-auth-hashes.mjs.
 */
import { isLegacyBcryptHash } from './authOwnCore.js'

const lower = (v) => String(v ?? '').trim().toLowerCase()

/**
 * @param {Array<{ id?: string, email?: string, encrypted_password?: string }>} authRows
 * @param {Array<{ id: string, email?: string, login?: string, password_hash?: string }>} usersRows
 */
export function planAuthHashImport(authRows, usersRows) {
  const byId = new Map(usersRows.map((u) => [String(u.id), u]))
  const emailCount = new Map()
  for (const u of usersRows) if (lower(u.email)) emailCount.set(lower(u.email), (emailCount.get(lower(u.email)) ?? 0) + 1)
  const byEmail = new Map(usersRows.filter((u) => emailCount.get(lower(u.email)) === 1).map((u) => [lower(u.email), u]))

  const updates = new Map()
  const unmatchedAuth = []
  let noHash = 0
  let keptOwn = 0
  for (const a of authRows) {
    if (!isLegacyBcryptHash(a?.encrypted_password)) {
      noHash += 1
      continue
    }
    const viaId = byId.get(String(a.id ?? ''))
    const user = viaId ?? byEmail.get(lower(a.email))
    if (!user) {
      unmatchedAuth.push(String(a.id ?? ''))
      continue
    }
    if (String(user.password_hash ?? '').startsWith('scrypt$')) {
      keptOwn += 1
      continue
    }
    const prev = updates.get(user.id)
    if (prev?.via === 'id') continue
    updates.set(user.id, { userId: user.id, passwordHash: a.encrypted_password, via: viaId ? 'id' : 'email' })
  }
  const withPassword = new Set([...updates.keys()])
  const staffWithoutPassword = usersRows
    .filter((u) => !withPassword.has(u.id) && !String(u.password_hash ?? '').startsWith('scrypt$'))
    .map((u) => u.login || u.id)
  return { updates: [...updates.values()], unmatchedAuth, noHash, keptOwn, staffWithoutPassword }
}

/** Выгрузка из SQL Editor Supabase: JSON-массив или CSV с заголовком id,email,encrypted_password. */
export function parseAuthExport(text) {
  const raw = String(text ?? '').trim()
  if (raw.startsWith('[')) return JSON.parse(raw)
  const [head, ...lines] = raw.split(/\r?\n/).filter(Boolean)
  const cols = head.split(',').map((c) => c.trim().replace(/^"|"$/g, ''))
  return lines.map((line) => {
    const cells = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''))
    return Object.fromEntries(cols.map((c, i) => [c, cells[i] ?? '']))
  })
}
