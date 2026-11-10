/**
 * Шапка сотрудника: название клуба без «—» (INC-2026-11-10-04).
 * node scripts/verify-header-club-title.mjs
 */
import { isRealClubDisplayName, staffHeaderClubTitle } from '../src/lib/headerClubTitleCore.js'

let failed = 0
function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed += 1
  } else {
    console.log('ok:', msg)
  }
}

ok(staffHeaderClubTitle(null) === '…', 'ещё грузим')
ok(staffHeaderClubTitle(undefined) === '…', 'undefined — грузим')
ok(staffHeaderClubTitle('') === 'Клуб', 'пусто → Клуб')
ok(staffHeaderClubTitle('—') === 'Клуб', 'палочка → Клуб')
ok(staffHeaderClubTitle('   ') === 'Клуб', 'пробелы → Клуб')
ok(staffHeaderClubTitle('X•fit studio Москва') === 'X•fit studio Москва', 'имя клуба как есть')
ok(staffHeaderClubTitle('Фит-Сити Брянск') === 'Фит-Сити Брянск', 'обычное имя')
ok(isRealClubDisplayName('X•fit studio Москва'), 'реальное имя')
ok(!isRealClubDisplayName('—') && !isRealClubDisplayName('') && !isRealClubDisplayName('Клуб'), 'заглушки не реальные')

if (failed) {
  console.error(`verify-header-club-title: ${failed} fail`)
  process.exit(1)
}
console.log('verify-header-club-title: OK')
