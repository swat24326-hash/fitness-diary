import { createClient } from '@supabase/supabase-js'
import { spawnSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

export const QA_PREFIX = 'qa_auto_'
export const QA_PASSWORD = 'QaAuto2026!'
export const QA_CLUB_ID = 'd5cf1b9c-6fa5-4ece-bb00-d7a99aac71ea'
export const PROD_ORIGIN = process.env.QA_ORIGIN ?? 'https://fitness-diary-bice.vercel.app'

function loadEnvFile(path) {
  const out = {}
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue
    const i = line.indexOf('=')
    if (i < 1) continue
    const key = line.slice(0, i).trim()
    let val = line.slice(i + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    out[key] = val
  }
  return out
}

export function resolveServiceRoleKey() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    return process.env.SUPABASE_SERVICE_ROLE_KEY.trim()
  }
  const refPath = resolve('supabase/.temp/project-ref')
  const ref = existsSync(refPath) ? readFileSync(refPath, 'utf8').trim() : 'hrylzinyasucjecltxpc'
  const r = spawnSync('npx', ['supabase', 'projects', 'api-keys', '--project-ref', ref], {
    encoding: 'utf8',
    shell: true,
  })
  if (r.status !== 0) return ''
  try {
    const parsed = JSON.parse(r.stdout)
    const row = (parsed.keys ?? []).find((k) => k.id === 'service_role' || k.name === 'service_role')
    return String(row?.api_key ?? '').trim()
  } catch {
    return ''
  }
}

export function createSupabaseAdmin() {
  const envLocal = existsSync(resolve('.env')) ? loadEnvFile(resolve('.env')) : {}
  const url = (envLocal.VITE_SUPABASE_URL || 'https://hrylzinyasucjecltxpc.supabase.co').replace(/\/$/, '')
  const serviceKey = resolveServiceRoleKey()
  if (!serviceKey) throw new Error('Не удалось получить SUPABASE_SERVICE_ROLE_KEY')
  return createClient(url, serviceKey)
}

export async function upsertQaUser(admin, { login, role, name, club_id = null }) {
  // Важно: auth-sign-in для логина без @ сначала пробует login@trainer.local.
  const email = `${login}@trainer.local`
  const rowBase = {
    name,
    phone: null,
    email,
    login,
    role,
    password_hash: 'supabase-auth',
    is_active: true,
    club_id,
  }

  const { data: existing } = await admin.from('users').select('id, login, role').eq('login', login).maybeSingle()
  if (existing?.id) {
    const upd = await admin.auth.admin.updateUserById(existing.id, {
      password: QA_PASSWORD,
      email_confirm: true,
      email,
    })
    if (!upd.error) {
      await admin.from('users').update(rowBase).eq('id', existing.id)
      return { id: existing.id, login, email, role, action: 'reset' }
    }
    // orphan public.users без Auth — создаём Auth с тем же id
    const { data: recreated, error: recreateErr } = await admin.auth.admin.createUser({
      id: existing.id,
      email,
      password: QA_PASSWORD,
      email_confirm: true,
    })
    if (recreateErr || !recreated?.user) {
      // email может быть занят старым @qa.local Auth — удалим сироту
      const orphan = await findAuthUserByEmail(admin, `${login}@qa.local`)
      if (orphan) await admin.auth.admin.deleteUser(orphan.id)
      const { data: recreated2, error: recreateErr2 } = await admin.auth.admin.createUser({
        id: existing.id,
        email,
        password: QA_PASSWORD,
        email_confirm: true,
      })
      if (recreateErr2 || !recreated2?.user) {
        throw new Error(recreateErr2?.message ?? recreateErr?.message ?? `Auth recreate failed for ${login}`)
      }
    }
    await admin.from('users').update(rowBase).eq('id', existing.id)
    return { id: existing.id, login, email, role, action: 'recreated-auth' }
  }

  let uid = null
  let wasNewAuth = false
  const { data: created, error: auErr } = await admin.auth.admin.createUser({
    email,
    password: QA_PASSWORD,
    email_confirm: true,
  })

  if (created?.user) {
    wasNewAuth = true
    uid = created.user.id
  } else {
    const msg = auErr?.message ?? 'auth create failed'
    if (!/already been registered|already registered/i.test(msg)) throw new Error(msg)
    const authUser = await findAuthUserByEmail(admin, email)
    if (!authUser) throw new Error(msg)
    uid = authUser.id
    await admin.auth.admin.updateUserById(uid, { password: QA_PASSWORD, email_confirm: true, email })
  }

  const { error: insErr } = await admin.from('users').upsert({ id: uid, ...rowBase })
  if (insErr) {
    if (wasNewAuth) await admin.auth.admin.deleteUser(uid)
    throw new Error(insErr.message)
  }
  return { id: uid, login, email, role, action: wasNewAuth ? 'created' : 'relinked' }
}

async function findAuthUserByEmail(admin, email) {
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) return null
    const hit = (data?.users ?? []).find((u) => String(u.email ?? '').toLowerCase() === email.toLowerCase())
    if (hit) return hit
    if ((data?.users ?? []).length < 200) break
  }
  return null
}

export async function deleteQaUsers(admin) {
  const { data: rows } = await admin
    .from('users')
    .select('id, login, role, email')
    .or(`login.like.${QA_PREFIX}%,email.like.%@qa.local,email.like.%@trainer.local`)
  const deleted = []
  for (const row of rows ?? []) {
    if (!String(row.login ?? '').startsWith(QA_PREFIX) && !String(row.email ?? '').includes(QA_PREFIX)) {
      continue
    }
    await admin.from('users').delete().eq('id', row.id)
    await admin.auth.admin.deleteUser(row.id)
    deleted.push({ login: row.login, role: row.role, id: row.id })
  }
  // Сироты Auth без строки в public.users (если users удалили вручную)
  let page = 1
  for (;;) {
    const { data: authPage, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) break
    const users = authPage?.users ?? []
    for (const u of users) {
      const email = String(u.email ?? '')
      if (!email.includes(`${QA_PREFIX}`)) continue
      if (deleted.some((d) => d.id === u.id)) continue
      await admin.auth.admin.deleteUser(u.id)
      deleted.push({ login: email.split('@')[0], role: '?', id: u.id })
    }
    if (users.length < 200) break
    page++
  }
  return deleted
}

export async function signInProd(login) {
  const res = await fetch(`${PROD_ORIGIN}/api/auth-sign-in`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login, password: QA_PASSWORD }),
  })
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, data }
}

export function tokenFromSignIn(data) {
  return data?.session?.access_token ?? data?.access_token ?? null
}
