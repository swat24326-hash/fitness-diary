/**
 * /me: первая карточка (тренировка скоро или абонемент), напоминание о продлении, график веса.
 * node scripts/verify-client-me-highlights.mjs
 */
import {
  clientMeLeadCard,
  clientRenewalHint,
  membershipBarPercent,
  nearestDotIndex,
  weightSparkCaption,
  weightSparkGeometry,
  weightSparkPath,
  weightSparkPoints,
} from '../src/lib/client/clientMeHighlightsCore.js'
import { membershipNote, membershipTile, sessionTile } from '../src/lib/client/clientMeTilesCore.js'
import { lastVisitWidget, weightDeltaWidget } from '../src/lib/client/clientMeUiCore.js'
import { recentTrainingRow, recentTrainingsSummary } from '../src/lib/client/clientTrainingsUiCore.js'

let failed = 0
function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed += 1
  } else {
    console.log('ok:', msg)
  }
}

const TODAY = '2026-10-07'
const mem = (o) => ({ status: 'active', total: 10, used: 3, remaining: 7, days_left: 20, ...o })

ok(clientMeLeadCard({ as_of: TODAY, next_session: { date: TODAY } }) === 'session', 'тренировка сегодня — первая')
ok(clientMeLeadCard({ as_of: TODAY, next_session: { date: '2026-10-08' } }) === 'session', 'тренировка завтра — первая')
ok(clientMeLeadCard({ as_of: TODAY, next_session: { date: '2026-10-09' } }) === 'membership', 'послезавтра — первым абонемент')
ok(clientMeLeadCard({ as_of: TODAY, next_session: null }) === 'membership', 'нет тренировки — абонемент')

ok(clientRenewalHint({ current: [mem()] }) === null, 'запас большой — молчим')
ok(/Осталось 2 тренировки/.test(clientRenewalHint({ current: [mem({ remaining: 2 })] }) ?? ''), 'осталось 2 — напоминание')
ok(/Осталось 1 тренировка/.test(clientRenewalHint({ current: [mem({ remaining: 1 })] }) ?? ''), 'склонение «1 тренировка»')
ok(/через 5 дней/.test(clientRenewalHint({ current: [mem({ days_left: 5 })] }) ?? ''), 'срок ≤7 дней — напоминание')
ok(/последний день/.test(clientRenewalHint({ current: [mem({ days_left: 0 })] }) ?? ''), 'последний день')
ok(
  /через 3 дня/.test(clientRenewalHint({ current: [mem({ total: null, remaining: null, days_left: 3 })] }) ?? ''),
  'безлимит — только по сроку',
)
ok(clientRenewalHint({ current: [mem({ remaining: 1 }), mem({ status: 'upcoming' })] }) === null, 'следующий уже куплен — молчим')
ok(clientRenewalHint({ current: [mem({ status: 'depleted', remaining: 0 })] }) === null, 'исчерпан — без дубля подписи')
ok(clientRenewalHint({ current: [], last_ended: { label: 'ПЗ' } }) === null, 'нет текущих — молчим')

ok(weightSparkPoints([{ date: '2026-09-01', kg: 80 }], 300, 64) === null, 'одна точка — графика нет')
const pts = weightSparkPoints(
  [
    { date: '2026-09-01', kg: 82 },
    { date: '2026-09-03', kg: 81 },
    { date: '2026-10-01', kg: 80 },
  ],
  300,
  64,
)
const parsed = (pts ?? '').split(' ').map((p) => p.split(',').map(Number))
ok(parsed.length === 3, 'три точки')
ok(parsed[0][0] === 4 && parsed[2][0] === 296, 'края по X с отступом')
ok(parsed[1][0] < 40, 'X по датам, не по индексу')
ok(parsed[0][1] === 4 && parsed[2][1] === 60, 'больший вес выше')
const flat = weightSparkPoints(
  [
    { date: '2026-09-01', kg: 80 },
    { date: '2026-09-10', kg: 80 },
  ],
  300,
  64,
)
ok(flat === '4,32 296,32', 'ровный вес — линия посередине')

const geo = weightSparkGeometry(
  [
    { date: '2026-06-01', kg: 99 },
    { date: '2026-06-02', kg: 89 },
    { date: '2026-08-20', kg: 94 },
  ],
  300,
  64,
)
ok(geo?.dots.length === 3 && geo.maxKg === 99 && geo.minKg === 89, 'точка на каждый замер, подписи макс/мин')
ok(geo?.dots[1].kg === 89 && geo.dots[1].y === 60, 'резкий замер виден как точка внизу, не маскируется')

ok(weightSparkPath([{ x: 0, y: 0 }]) === '', 'кривая: одна точка — пусто')
const curve = weightSparkPath(geo.dots)
ok(curve.startsWith(`M${geo.dots[0].x},${geo.dots[0].y}`) && curve.endsWith(`${geo.dots[2].x},${geo.dots[2].y}`), 'кривая от первой до последней точки')
const ctrlY = [...curve.matchAll(/C([\d.,\s-]+)/g)].flatMap((m) =>
  m[1].trim().split(' ').map((p) => Number(p.split(',')[1])),
)
ok(ctrlY.every((y) => y >= 4 && y <= 60), 'кривая не вылетает выше максимума и ниже минимума')
ok(nearestDotIndex(geo.dots, 0) === 0 && nearestDotIndex(geo.dots, 300) === 2, 'палец у краёв — крайние замеры')
ok(nearestDotIndex([{ x: 296 }, { x: 296 }], 296) === 1, 'точки слились — берём более свежий замер')
ok(nearestDotIndex([], 10) === -1, 'нет точек — -1')
const capLast = weightSparkCaption(geo.dots, 2)
ok(capLast?.kg === '94' && capLast.note === 'последний замер', 'шапка: последний замер по умолчанию')
ok(weightSparkCaption(geo.dots, 0)?.note === 'с тех пор −5 кг', 'шапка: выбранный замер — сколько изменилось к сегодня')
ok(weightSparkCaption(geo.dots, 1)?.note === 'с тех пор +5 кг', 'шапка: рост со знаком +')
ok(weightSparkCaption(geo.dots, 9) === null, 'шапка: нет точки — null')

const rowToday = recentTrainingRow({ date: '2026-10-07', focus: 'Ноги', kg: 74.5, trainer_name: 'Анна', no_show: false }, TODAY)
ok(rowToday.num === '07' && rowToday.weekday === 'ср' && rowToday.title === 'Ноги', 'строка: число, день недели, направленность')
ok(rowToday.meta === 'сегодня · Анна · 74,5\u00a0кг', 'строка: когда · тренер · вес (кг не отрывается от числа)')
ok(recentTrainingRow({ date: '2026-10-06', focus: null, kg: null, trainer_name: null, no_show: false }, TODAY).meta === 'вчера', 'вчера, без пустых полей')
const miss = recentTrainingRow({ date: '2026-09-15', focus: null, kg: null, trainer_name: 'Анна', no_show: true }, TODAY)
ok(miss.noShow && miss.title === 'Неявка' && miss.meta === '15 сентября · занятие списано с абонемента', 'неявка: понятно, куда ушло занятие')
ok(recentTrainingRow({ date: '2026-10-01', focus: '', kg: null, trainer_name: null, no_show: false }, TODAY).title === 'Тренировка', 'без направленности — «Тренировка»')
ok(
  recentTrainingsSummary([{ no_show: false }, { no_show: false }, { no_show: true }]) === '2 тренировки за 30 дней · 1 неявка',
  'сводка: тренировки и неявки',
)
ok(recentTrainingsSummary([]) === '0 тренировок за 30 дней', 'пусто — ноль')

ok(membershipBarPercent({ total: 50, remaining: 44, used: 6 }) === 88, 'полоска по остатку: 44 из 50 → 88%')
ok(membershipBarPercent({ total: 10, remaining: 0 }) === 0, 'исчерпан — полоска пустая')
ok(membershipBarPercent({ total: null, remaining: null }) === null, 'безлимит — полоски нет')
ok(membershipBarPercent({ total: 10, remaining: 12 }) === 100, 'больше 100% не рисуем')

const wd = weightDeltaWidget([{ date: '2026-06-01', kg: 99 }, { date: '2026-08-20', kg: 94 }])
ok(wd?.sign === '−' && wd.value === '5' && wd.label === 'с 01.06.26', 'виджет веса: −5 кг / с 01.06.26, знак отдельно')
ok(wd?.aria === '−5 кг с 01.06.26', 'для озвучки — одной фразой')
const up = weightDeltaWidget([{ date: '2026-06-01', kg: 90 }, { date: '2026-07-01', kg: 91.5 }])
ok(up?.sign === '+' && up.value === '1,5', 'набор — плюс, запятая')
ok(weightDeltaWidget([{ date: '2026-06-01', kg: 90 }, { date: '2026-07-01', kg: 90 }])?.sign === '', 'без изменений — без знака')
ok(weightDeltaWidget([{ date: '2024-09-15', kg: 90 }, { date: '2026-10-01', kg: 89 }])?.label === 'с 15.09.24', 'ходит несколько лет — год виден')
ok(weightDeltaWidget([{ date: '2026-06-01', kg: 90 }]) === null && weightDeltaWidget(null) === null, 'один замер — виджета нет')
const lv = (d) => lastVisitWidget(d, TODAY)
ok(lv('2026-09-26').value === '11' && lv('2026-09-26').label === 'дней назад', 'последняя: 11 дней назад')
ok(lv('2026-10-04').label === 'дня назад' && lv('2026-09-16').label === 'день назад', 'склонение: 3 дня, 21 день')
ok(lv(TODAY).value === 'сегодня' && lv('2026-10-06').value === 'вчера', 'сегодня / вчера')
ok(lv(null).value === '—' && lv('2026-10-09').value === 'сегодня', 'нет даты — прочерк; дата в будущем — не минус')

// --- Плитки: одна схема «значение → подпись → подвал» ---
const mt = membershipTile({ current: [mem({ total: 50, remaining: 44, end_date: '2027-01-27' })] }, TODAY)
ok(mt.hero === '44' && mt.unit === 'из 50' && mt.caption === 'тренировки осталось' && mt.foot === 'До 27.01.2027' && mt.bar === 88, 'плитка абонемента: 44 из 50, до даты, полоска')
ok(membershipTile({ current: [mem({ remaining: 1 })] }, TODAY).caption === 'тренировка осталось', 'склонение в подписи')
const dep = membershipTile({ current: [mem({ status: 'depleted', remaining: 0 })] }, TODAY)
ok(dep.hero === '0' && dep.tone === 'warn' && dep.foot === 'Продлить можно в клубе', 'исчерпан — предупреждение')
const unl = membershipTile({ current: [mem({ total: null, remaining: null, days_left: 12, end_date: '2026-10-19' })] }, TODAY)
ok(unl.hero === '12' && unl.unit === 'дней' && unl.bar === null, 'безлимит — дни до конца, без полоски')
ok(membershipTile({ current: [mem({ end_date: TODAY })] }, TODAY).foot === 'Последний день', 'последний день в подвале')
ok(membershipTile({ current: [] }, TODAY).hero === '—' && membershipTile({ current: [] }, TODAY).tone === 'muted', 'нет абонемента — прочерк')
ok(/закончился 01\.09\.2026/.test(membershipTile({ current: [], last_ended: { end_date: '2026-09-01' } }, TODAY).caption), 'закончился — дата')
const both = { current: [mem(), mem({ status: 'upcoming', start_date: '2026-11-01' })] }
ok(membershipTile(both, TODAY).tone === 'ok', 'в плитке текущий, а не будущий')
ok(membershipNote(both) === 'Следующий абонемент начнётся 01.11.2026', 'будущий — заметкой под плитками')
ok(/продлить можно/.test(membershipNote({ current: [mem({ remaining: 2 })] }) ?? ''), 'продление — заметкой под плитками')
ok(membershipNote({ current: [mem()] }) === null, 'всё спокойно — заметки нет')
const st = sessionTile({ date: '2026-10-08', time: '18:00', trainer_name: 'Анна' }, TODAY)
ok(st.hero === '18:00' && st.caption === 'завтра' && st.foot === 'Тренер: Анна', 'плитка тренировки: время, день, тренер')
const none = sessionTile(null, TODAY)
ok(none.hero === '—' && none.tone === 'muted' && none.foot === 'Договоритесь с тренером', 'нет тренировки — прочерк, как у абонемента')

if (failed) {
  console.error(`\nverify-client-me-highlights: ${failed} FAIL`)
  process.exit(1)
}
console.log('\nverify-client-me-highlights: OK')
