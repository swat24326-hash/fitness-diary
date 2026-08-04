/**
 * Ссылки списка клиентов — сохранение вкладки/фильтра/страницы.
 * node scripts/verify-admin-clients-list-href.mjs
 */
import {
  buildAdminClientCardHref,
  buildAdminClientsBackHref,
  buildAdminClientsListHref,
  buildAdminClientsListSearch,
  parseAdminClientsListPage,
  pickAdminClientsListSearchParams,
} from '../src/lib/admin/adminClientsListHrefCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(parseAdminClientsListPage(null) === 0, 'page null → 0')
ok(parseAdminClientsListPage('1') === 0, 'page 1 → index 0')
ok(parseAdminClientsListPage('3') === 2, 'page 3 → index 2')

const list = buildAdminClientsListHref('/sales/clients', {
  clubId: 'c1',
  clientsTab: 'tz',
  filter: 'birthdays',
  page: 2,
  query: 'ива',
  trainerQuery: 'пет',
})
ok(
  list === '/sales/clients?club=c1&clientsTab=tz&filter=birthdays&page=2&q=%D0%B8%D0%B2%D0%B0&trainer=%D0%BF%D0%B5%D1%82' ||
    list.includes('clientsTab=tz') && list.includes('page=2') && list.includes('filter=birthdays'),
  'list href keeps state',
)

const card = buildAdminClientCardHref('/sales/clients', 'cid', {
  clubId: 'c1',
  clientsTab: 'az',
  page: 2,
})
ok(card.startsWith('/sales/clients/cid?'), 'card path')
ok(card.includes('clientsTab=az') && card.includes('page=2'), 'card keeps list qs')

const back = buildAdminClientsBackHref('/sales/clients', new URLSearchParams('club=c1&clientsTab=tz&page=2&tab=health'))
ok(back.includes('clientsTab=tz') && back.includes('page=2'), 'back keeps list keys')
ok(!back.includes('tab=health'), 'back drops card-only keys')

const activeOnly = buildAdminClientsListSearch({ clientsTab: 'active', page: 1 })
ok(!activeOnly.has('clientsTab') && !activeOnly.has('page'), 'defaults omitted')

const picked = pickAdminClientsListSearchParams('club=x&page=2&foo=1')
ok(picked.get('club') === 'x' && picked.get('page') === '2' && !picked.has('foo'), 'pick keys')

process.exit(failed > 0 ? 1 : 0)
