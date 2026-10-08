/**
 * node scripts/verify-sales-client-lookup.mjs
 * Поиск клиента клуба по карте / телефону в БД (клипы, ПНК) — без загрузки всего клуба.
 */
import {
  buildSalesCardIlikePattern,
  buildSalesCardsOrIlikeExpr,
  buildSalesPhoneIlikePattern,
  mergeClientRowsById,
} from '../src/lib/admin/salesClientLookupCore.js'
import { matchClientByCardThenPhone } from '../src/lib/admin/salesClientMatchCore.js'
import { fetchClubClientCandidates } from '../api/_lib/salesClientLookup.js'
import { compileWhereClause } from '../api/_lib/pgRest/filters.js'

let failed = 0
function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed += 1
  }
}

/** ILIKE как в Postgres: `%`, `_`, экранирование `\`. */
function ilike(value, pattern) {
  let re = ''
  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern[i]
    if (ch === '\\') {
      i += 1
      re += pattern[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    } else if (ch === '%') re += '.*'
    else if (ch === '_') re += '.'
    else re += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${re}$`, 'isu').test(String(value ?? ''))
}

function fakeSupabase(rows) {
  const calls = []
  return {
    calls,
    from() {
      const filters = []
      let limit = Infinity
      const q = {
        select: () => q,
        eq: (col, v) => (filters.push((r) => r[col] === v), q),
        is: (col, v) => (filters.push((r) => (r[col] ?? null) === v), q),
        ilike: (col, p) => (calls.push(col), filters.push((r) => ilike(r[col], p)), q),
        limit: (n) => ((limit = n), q),
        then: (res) => res({ data: rows.filter((r) => filters.every((f) => f(r))).slice(0, limit), error: null }),
      }
      return q
    },
  }
}

// --- шаблоны
ok(buildSalesCardIlikePattern('') === null, 'пустая карта — без шаблона')
ok(buildSalesCardIlikePattern('№ 247') === '%247%', 'карта: № и пробелы убраны')
ok(buildSalesCardIlikePattern('р247') === '%_247%', 'карта: буква → _')
ok(buildSalesCardIlikePattern('12%_3') === '%12\\%\\_3%', 'карта: % и _ экранированы')
ok(buildSalesPhoneIlikePattern('123') === null, 'короткий телефон — без шаблона')
ok(buildSalesPhoneIlikePattern('8 (912) 345-67-89') === '%9%1%2%3%4%5%6%7%8%9%', 'телефон: 10 цифр через %')

for (const stored of ['+7 (912) 345-67-89', '8 912 345 67 89', '9123456789', '79123456789']) {
  ok(ilike(stored, buildSalesPhoneIlikePattern('89123456789')), `телефон в базе «${stored}» попадает в шаблон`)
}
for (const stored of ['Р247', '№ р247', 'р247 ']) {
  ok(ilike(stored, buildSalesCardIlikePattern('р247')), `карта в базе «${stored}» попадает в шаблон`)
}
ok(!ilike('248', buildSalesCardIlikePattern('247')), 'чужая карта не попадает')

ok(mergeClientRowsById([[{ id: 'a' }, { id: 'b' }], [{ id: 'b' }, { id: 'c' }]]).length === 3, 'merge без дублей по id')

// --- or() для reconcile проходит через pgRest
const orExpr = buildSalesCardsOrIlikeExpr(['247', 'р12', '247', ''])
const values = []
const where = compileWhereClause([{ op: 'or', expr: orExpr }], values, () => 'text')
ok(!where.error && values.length === 2, `or() из карт компилируется в SQL (${where.error || values.join(' | ')})`)
ok(values.includes('%247%') && values.includes('%_12%'), 'or(): шаблоны карт как параметры')
ok(buildSalesCardsOrIlikeExpr([]) === null, 'or(): пустой список карт — null')

// --- клуб больше старых лимитов (800 / 5000): клиент в хвосте находится
const CLUB = 'club-1'
const rows = []
for (let i = 0; i < 6000; i += 1) {
  rows.push({ id: `c${i}`, club_id: CLUB, name: `Клиент ${i}`, phone: `+7 900 ${String(i).padStart(7, '0')}`, card_number: String(10000 + i), archived_at: null })
}
rows.push({ id: 'tail', club_id: CLUB, name: 'Хвост', phone: '+7 (912) 345-67-89', card_number: 'Р777', archived_at: null })
rows.push({ id: 'arch', club_id: CLUB, name: 'Архив', phone: '89123456789', card_number: null, archived_at: '2026-01-01' })
rows.push({ id: 'other', club_id: 'club-2', name: 'Другой клуб', phone: '89123456789', card_number: 'р777', archived_at: null })

const sel = 'id'
const byCard = await fetchClubClientCandidates(fakeSupabase(rows), { clubId: CLUB, cardNumber: 'р777', select: sel })
const mCard = matchClientByCardThenPhone({ clients: byCard.data, cardNumber: 'р777' })
ok(mCard.status === 'one' && mCard.client.id === 'tail', `клиент №6000+ найден по карте (${mCard.status})`)
ok(byCard.data.every((r) => r.club_id === CLUB), 'кандидаты только своего клуба')

const sbPhone = fakeSupabase(rows)
const byPhone = await fetchClubClientCandidates(sbPhone, { clubId: CLUB, phone: '8-912-345-67-89', select: sel, activeOnly: true })
const mPhone = matchClientByCardThenPhone({ clients: byPhone.data, phone: '8-912-345-67-89' })
ok(mPhone.status === 'one' && mPhone.client.id === 'tail', `по телефону: один живой, архив отсечён (${mPhone.status})`)
ok(sbPhone.calls.join() === 'phone', 'без карты — только запрос по телефону')

const withArch = await fetchClubClientCandidates(fakeSupabase(rows), { clubId: CLUB, phone: '89123456789', select: sel })
ok(withArch.data.some((r) => r.id === 'arch'), 'без activeOnly архив виден (проверка занятой карты при create)')

const both = await fetchClubClientCandidates(fakeSupabase(rows), { clubId: CLUB, cardNumber: '10005', phone: '89123456789', select: sel })
ok(both.data.filter((r) => r.id === 'tail').length === 1, 'карта + телефон: кандидаты слиты без дублей')
ok(matchClientByCardThenPhone({ clients: both.data, cardNumber: '10005', phone: '89123456789' }).client?.id === 'c5', 'карта приоритетнее телефона')

const sbEmpty = fakeSupabase(rows)
const none = await fetchClubClientCandidates(sbEmpty, { clubId: CLUB, select: sel })
ok(none.data.length === 0 && sbEmpty.calls.length === 0, 'нет карты и телефона — запросов нет')

const errSb = { from: () => ({ select() { return this }, eq() { return this }, ilike() { return this }, is() { return this }, limit() { return this }, then: (res) => res({ data: null, error: { message: 'boom' } }) }) }
const errRes = await fetchClubClientCandidates(errSb, { clubId: CLUB, cardNumber: '1', select: sel })
ok(errRes.error?.message === 'boom', 'ошибка БД пробрасывается, не «не найден»')

if (failed) {
  console.error(`verify-sales-client-lookup: ${failed} FAIL`)
  process.exit(1)
}
console.log('verify-sales-client-lookup: OK')
