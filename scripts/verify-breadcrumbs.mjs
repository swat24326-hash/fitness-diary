/**
 * Хлебные крошки — вкладки продаж, структура, путь к тренировке.
 * node scripts/verify-breadcrumbs.mjs
 */
import {
  ADMIN_SALES_TAB_LABELS,
  MANAGER_SALES_TAB_LABELS,
  STRUCTURE_TAB_LABELS,
  adminClubQs,
  buildBreadcrumbs,
} from '../src/lib/breadcrumbsCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

function labels(pathname, search = '') {
  return buildBreadcrumbs(pathname, search).map((c) => c.label)
}

ok(adminClubQs('?club=abc') === '?club=abc', 'club qs kept')
ok(adminClubQs('?x=1') === '', 'no club → empty qs')

ok(labels('/admin').length === 0, 'admin home → no crumbs')
ok(
  labels('/admin/structure', '?club=c1&tab=trainers').join(' › ') === 'Админка › Структура › Тренеры',
  'structure trainers + club',
)
ok(STRUCTURE_TAB_LABELS['coach-quality'] === 'Качество ведения', 'structure coach-quality label')

ok(
  labels('/admin/sales', '?club=c1').join(' › ') === 'Админка › Продажи › Отчёт за день',
  'admin sales default daily',
)
ok(
  labels('/admin/sales', '?club=c1&tab=finance').join(' › ') === 'Админка › Продажи › Финансы клуба',
  'admin sales finance tab',
)
ok(ADMIN_SALES_TAB_LABELS.clips === 'Заявка тренеру', 'admin clips label')

ok(labels('/sales').join(' › ') === 'План продаж', 'manager home single crumb')
ok(
  labels('/sales', '?tab=report').join(' › ') === 'План продаж › Отчёт за день',
  'manager report tab',
)
ok(
  labels('/sales', '?tab=analytics').join(' › ') === 'План продаж › Аналитика',
  'manager analytics tab',
)
ok(MANAGER_SALES_TAB_LABELS.clips === 'Заявка тренеру', 'manager clips label')
ok(
  labels('/sales/pnk').join(' › ') === 'План продаж › ПНК',
  'manager pnk',
)
ok(
  labels('/sales/clients').join(' › ') === 'План продаж › Клиенты',
  'manager clients list',
)
ok(
  labels('/sales/clients/cid').join(' › ') === 'План продаж › Клиенты › Карточка клиента',
  'manager client card',
)
ok(
  buildBreadcrumbs('/sales/clients/cid', '?clientsTab=tz&page=2')[1].to ===
    '/sales/clients?clientsTab=tz&page=2',
  'manager client card → list keeps tab/page',
)
ok(
  buildBreadcrumbs('/sales/clients/cid', '?from=strategy')[1].to === '/sales?tab=strategy',
  'manager client card → strategy when from=strategy',
)

ok(
  labels('/trainer/workouts/w1').join(' › ') === 'Главная › Клиенты › Тренировка',
  'trainer workout path',
)
ok(
  labels('/admin/workouts/w1', '?club=c1').join(' › ') === 'Админка › Клиенты › Тренировка',
  'admin workout path',
)
ok(
  buildBreadcrumbs('/admin/workouts/w1', '?club=c1')[1].to === '/admin/clients?club=c1',
  'admin workout → clients keeps club',
)

ok(
  labels('/admin/clients/cid', '?club=c1').join(' › ') === 'Админка › Клиенты › Карточка клиента',
  'admin client card',
)
ok(
  buildBreadcrumbs('/admin/clients/cid', '?club=c1&clientsTab=az&filter=birthdays&page=3')[1].to ===
    '/admin/clients?club=c1&clientsTab=az&filter=birthdays&page=3',
  'admin client card → list keeps state',
)
ok(
  labels('/trainer/clients/cid').join(' › ') === 'Главная › Клиенты › Карточка',
  'trainer client card',
)

if (failed) process.exit(1)
console.log('verify-breadcrumbs: all passed')
