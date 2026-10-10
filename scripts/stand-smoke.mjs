/**
 * Проверка стенда после сборки: вход тренера и админа, pull, запись завершённой тренировки, отказ без входа.
 * Пишет только в базу стенда (тестовый клуб c2-seed). Пароли — из C2_SEED_CREDENTIALS_FILE.
 *
 * Usage (на стенде): sudo -u osapp node scripts/stand-smoke.mjs [http://127.0.0.1:8080]
 */
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'

const BASE = (process.argv[2] || 'http://127.0.0.1:8080').replace(/\/$/, '')
const CREDENTIALS_FILE = process.env.C2_SEED_CREDENTIALS_FILE || '/opt/fitness-diary/.c2-seed-credentials'

let failed = 0
function ok(cond, msg) {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`)
  if (!cond) failed += 1
  return cond
}

async function call(path, { method = 'GET', token, body } = {}) {
  const headers = { accept: 'application/json' }
  if (token) headers.authorization = `Bearer ${token}`
  if (body) headers['content-type'] = 'application/json'
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined })
  const text = await res.text()
  let data = null
  try {
    data = JSON.parse(text)
  } catch {
    data = { raw: text.slice(0, 200) }
  }
  return { status: res.status, data, text }
}

async function signIn(passwords, login) {
  const out = await call('/api/auth-sign-in', { method: 'POST', body: { login, password: passwords[login] } })
  const token = out.data?.session?.access_token ?? out.data?.access_token ?? null
  ok(out.status === 200 && Boolean(token), `вход ${login}: HTTP ${out.status}`)
  return token
}

async function main() {
  const passwords = Object.fromEntries(
    (await readFile(CREDENTIALS_FILE, 'utf8'))
      .split('\n')
      .filter(Boolean)
      .map((line) => line.split('\t')),
  )

  ok((await call('/api/health')).status === 200, 'health')
  const index = await fetch(`${BASE}/`).then((r) => r.text())
  ok(index.includes('id="root"'), 'статика отдаёт index.html')
  ok((await call('/api/trainer-pull')).status === 401, 'trainer-pull без входа → 401')

  const trainerTok = await signIn(passwords, 'c2-trainer')
  const adminTok = await signIn(passwords, 'c2-admin')
  if (!trainerTok || !adminTok) return

  const pull = await call('/api/trainer-pull?skip_trainings=1', { token: trainerTok })
  const clients = pull.data?.clients ?? []
  ok(pull.status === 200 && clients.length > 0, `trainer-pull: HTTP ${pull.status}, клиентов ${clients.length}`)
  const membership = (pull.data?.memberships ?? []).find((m) => m.status === 'active')
  if (!ok(Boolean(membership), 'у тренера есть активный абонемент')) return

  const trainingId = randomUUID()
  const today = new Date().toISOString().slice(0, 10)
  const push = await call('/api/push-record', {
    method: 'POST',
    token: trainerTok,
    body: {
      table_name: 'trainings',
      operation: 'insert',
      remote_id: null,
      data: {
        id: trainingId,
        client_id: membership.client_id,
        trainer_id: membership.trainer_id ?? clients.find((c) => c.id === membership.client_id)?.trainer_id,
        club_id: pull.data?.club_id ?? membership.club_id,
        date: today,
        type: 'Силовая',
        status: 'completed',
        data: { exercises: [], note: 'stand-smoke', membership_id: membership.id },
      },
    },
  })
  ok(push.status === 200 && push.data?.ok !== false, `push тренировки: HTTP ${push.status} ${push.data?.error || ''}`)

  const after = await call('/api/trainer-pull', { token: trainerTok })
  ok(
    (after.data?.trainings ?? []).some((t) => t.id === trainingId && t.status === 'completed'),
    'тренировка видна в pull после записи',
  )

  const admin = await call('/api/list-memberships', { token: adminTok })
  ok(admin.status === 200, `админ: list-memberships HTTP ${admin.status}`)
  ok((await call('/api/list-memberships', { token: trainerTok })).status === 403, 'тренер: list-memberships → 403')
}

main()
  .catch((e) => {
    ok(false, `исключение: ${e?.message || e}`)
  })
  .finally(() => {
    if (failed) {
      console.error(`stand-smoke: FAIL (${failed})`)
      process.exit(1)
    }
    console.log('stand-smoke: ок')
  })
