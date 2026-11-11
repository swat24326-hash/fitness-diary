/**
 * Женский цикл + календарь /me: фазы, подсказки, маркеры тренировок/веса, валидация настроек.
 * node scripts/verify-client-cycle-calendar.mjs
 */
import {
  buildCycleCalendarMonth,
  calendarMonthTitleRu,
  collectClientTrainingMarkers,
  cyclePhaseForDay,
  cyclePhaseTrainingHintRu,
  parseCycleSettingsInput,
  publicClientCycle,
  shiftCalendarMonth,
} from '../src/lib/client/clientCycleCalendarCore.js'

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
  console.log('OK:', msg)
}

const TODAY = '2026-10-18'

ok(parseCycleSettingsInput({ enabled: false }).ok === true, 'выкл — ок')
ok(parseCycleSettingsInput({ enabled: true, cycle_days: 28, period_days: 5 }, TODAY).ok === false, 'без даты — отказ')
ok(
  parseCycleSettingsInput(
    { enabled: true, cycle_days: 28, period_days: 5, last_period_start: '2026-10-01' },
    TODAY,
  ).ok === true,
  'полный ввод — ок',
)
ok(
  parseCycleSettingsInput(
    { enabled: true, cycle_days: 28, period_days: 5, last_period_start: '2026-10-20' },
    TODAY,
  ).ok === false,
  'дата в будущем — отказ',
)
ok(
  parseCycleSettingsInput(
    { enabled: true, cycle_days: 20, period_days: 5, last_period_start: '2026-10-01' },
    TODAY,
  ).ok === false,
  'цикл слишком короткий',
)
ok(
  parseCycleSettingsInput(
    { enabled: true, cycle_days: 28, period_days: 28, last_period_start: '2026-10-01' },
    TODAY,
  ).ok === false,
  'месячные ≥ цикла — отказ',
)

const settings = {
  enabled: true,
  cycle_days: 28,
  period_days: 5,
  last_period_start: '2026-10-01',
}
ok(publicClientCycle(settings).enabled === true, 'public enabled')
ok(publicClientCycle({ enabled: false }).enabled === false, 'public disabled')
ok(cyclePhaseForDay('2026-10-01', settings) === 'period', '1-й день — месячные')
ok(cyclePhaseForDay('2026-10-05', settings) === 'period', '5-й день — месячные')
ok(cyclePhaseForDay('2026-10-06', settings) === 'follicular', 'после месячных — фолликулярная')
ok(cyclePhaseForDay('2026-10-14', settings) === 'ovulation' || cyclePhaseForDay('2026-10-15', settings) === 'ovulation', 'середина — овуляция')
ok(cyclePhaseForDay('2026-10-20', settings) === 'luteal', 'вторая половина — лютеиновая')
ok(cyclePhaseForDay('2026-10-29', settings) === 'period', 'следующий цикл — снова месячные')
ok(cyclePhaseForDay('2026-09-20', settings) === null, 'до старта — без фазы')

ok(cyclePhaseTrainingHintRu('period').includes('Лёгкая'), 'подсказка месячные')
ok(cyclePhaseTrainingHintRu('follicular').includes('объём'), 'подсказка фолликулярная')
ok(cyclePhaseTrainingHintRu('ovulation').includes('Силы'), 'подсказка овуляция')
ok(cyclePhaseTrainingHintRu('luteal').includes('Осторожнее'), 'подсказка лютеиновая')
ok(cyclePhaseTrainingHintRu(null) === '', 'без фазы — пустая подсказка')

const markers = collectClientTrainingMarkers(
  {
    current: [
      {
        visits: [
          { date: '2026-10-05', no_show: false },
          { date: '2026-10-10', no_show: true },
        ],
      },
    ],
  },
  { date: '2026-10-20' },
)
ok(markers.get('2026-10-05') === 'done', 'тренировка была')
ok(markers.get('2026-10-10') === 'noshow', 'неявка')
ok(markers.get('2026-10-20') === 'planned', 'следующая — planned')

const month = buildCycleCalendarMonth({
  year: 2026,
  month: 10,
  settings,
  memberships: {
    current: [{ visits: [{ date: '2026-10-05', no_show: false }] }],
  },
  nextSession: { date: '2026-10-20' },
  weights: [{ date: '2026-10-05', kg: 60.5 }],
  todayIso: TODAY,
})
ok(month.weeks.length >= 5, 'сетка месяца')
ok(month.legendHint.includes('не медсовет'), 'легенда — не медсовет')
const day5 = month.weeks.flat().find((c) => c.iso === '2026-10-05')
ok(day5?.phase === 'period' && day5.training === 'done' && day5.weightKg === 60.5, 'день: фаза+тренировка+вес')
const day20 = month.weeks.flat().find((c) => c.iso === '2026-10-20')
ok(day20?.training === 'planned' && day20.phase === 'luteal', 'следующая тренировка на лютеиновой')
const todayCell = month.weeks.flat().find((c) => c.iso === TODAY)
ok(todayCell?.isToday === true, 'сегодня отмечен')

const off = buildCycleCalendarMonth({
  year: 2026,
  month: 10,
  settings: { enabled: false },
  memberships: { current: [{ visits: [{ date: '2026-10-05' }] }] },
  todayIso: TODAY,
})
ok(off.weeks.flat().every((c) => !c.inMonth || c.phase == null), 'без цикла — фаз нет')
ok(off.weeks.flat().find((c) => c.iso === '2026-10-05')?.training === 'done', 'тренировки без цикла остаются')

ok(shiftCalendarMonth(2026, 12, 1).year === 2027 && shiftCalendarMonth(2026, 12, 1).month === 1, 'сдвиг месяца')
ok(calendarMonthTitleRu(2026, 10) === 'Октябрь 2026', 'заголовок месяца')

console.log('verify-client-cycle-calendar: OK')
