/**
 * Тестовый клуб стенда C2: строки seed без базы.
 * node scripts/verify-c2-seed.mjs
 */
import {
  buildC2SeedRows,
  buildC2StaffRow,
  C2_SEED_EMAIL_DOMAIN,
  C2_SEED_EXERCISES,
  C2_SEED_STAFF,
  C2_SEED_TABLE_ORDER,
  c2SeedGuardError,
} from '../src/lib/c2SeedCore.js'

let failed = 0

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed += 1
  } else {
    console.log('ok:', msg)
  }
}

let n = 0
const hashes = Object.fromEntries(C2_SEED_STAFF.map((s) => [s.key, `scrypt$16384$8$1$salt${s.key}$key`]))
const rows = buildC2SeedRows({ today: '2026-09-28', newId: () => `id-${++n}`, passwordHashes: hashes })
const clubId = rows.clubs[0].id

ok(rows.clubs.length === 1, 'один клуб')
ok(
  ['admin', 'trainer', 'sales_manager', 'supervisor'].every((r) => rows.users.some((u) => u.role === r)),
  'все четыре роли для входа',
)
ok(rows.users.every((u) => u.club_id === clubId && u.is_active), 'сотрудники в клубе и активны')
ok(rows.users.every((u) => u.password_hash.startsWith('scrypt$')), 'в users только хеш')
ok(rows.users.every((u) => u.email.endsWith(`@${C2_SEED_EMAIL_DOMAIN}`)), 'почты в зарезервированном домене .invalid')
ok(new Set(rows.users.map((u) => u.login)).size === rows.users.length, 'логины уникальны')

const trainer = rows.users.find((u) => u.role === 'trainer')
ok(rows.clients.length > 0 && rows.clients.every((c) => c.trainer_id === trainer.id && c.club_id === clubId), 'клиенты у тренера клуба')
ok(rows.clients.every((c) => c.phone.startsWith('+7000')), 'телефоны выдуманные')
ok(rows.memberships.length === rows.clients.length, 'по абонементу на клиента')
ok(
  rows.memberships.every((m) => rows.clients.some((c) => c.id === m.client_id) && m.club_id === clubId),
  'абонементы ссылаются на клиентов клуба',
)
ok(rows.memberships[0].end_date === '2026-11-27', 'абонемент на 60 дней')
ok(rows.memberships.every((m) => m.membership_type_id === rows.membership_types[0].id), 'тип абонемента проставлен')

const allIds = C2_SEED_TABLE_ORDER.flatMap((t) => rows[t].map((r) => r.id))
ok(new Set(allIds).size === allIds.length, 'id не повторяются')
ok(C2_SEED_TABLE_ORDER.indexOf('users') < C2_SEED_TABLE_ORDER.indexOf('clients'), 'порядок по внешним ключам')

ok(c2SeedGuardError({ users: 0, clubs: 0 }) === null, 'пустая база → можно')
ok(/users/.test(c2SeedGuardError({ users: 2, clubs: 0 }) ?? ''), 'непустая база → отказ с таблицей')

const base = { role: 'admin', name: 'Дмитрий', clubId: 'club-1', id: 'u-1', passwordHash: 'scrypt$x' }
const staff = buildC2StaffRow({ ...base, login: ' Dmitry ' })
ok(staff.row?.login === 'dmitry' && staff.row.email === `dmitry@${C2_SEED_EMAIL_DOMAIN}`, 'сотрудник: логин в нижнем регистре, почта .invalid')
ok(staff.row?.club_id === 'club-1' && staff.row.is_active, 'сотрудник в клубе стенда и активен')
ok(Boolean(buildC2StaffRow({ ...base, login: 'dm itry' }).error), 'логин с пробелом → отказ')
ok(Boolean(buildC2StaffRow({ ...base, login: 'dmitry', role: 'root' }).error), 'чужая роль → отказ')
ok(Boolean(buildC2StaffRow({ ...base, login: 'dmitry', clubId: null }).error), 'без клуба → отказ')

ok(C2_SEED_EXERCISES.length >= 5, 'есть базовые упражнения')
ok(C2_SEED_EXERCISES.every((e) => e.name && e.muscle_group), 'у упражнения имя и группа (NOT NULL)')
ok(new Set(C2_SEED_EXERCISES.map((e) => e.name)).size === C2_SEED_EXERCISES.length, 'имена упражнений уникальны (UNIQUE)')

if (failed) process.exit(1)
console.log('verify-c2-seed: all passed')
