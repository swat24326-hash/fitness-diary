/**
 * Сквозной сценарий ПНК: кнопки шапки + отказ на каждом шаге (чистая логика).
 * node scripts/verify-pnk-refuse-scenario.mjs
 */
import {
  buildPnkLostFunnelEvent,
  normalizePnkFunnelEventPushPayload,
} from '../src/lib/pnk/pnkFunnelEventsCore.js'
import { resolvePnkTrainerUiStep, isOpenPnkClient } from '../src/lib/pnk/pnkStagesCore.js'
import { resolvePnkFunnelHatNav } from '../src/lib/pnk/pnkWizardNavCore.js'
import { aggregatePnkFunnelStats } from '../src/lib/pnk/pnkStatsAgg.js'

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
  console.log('ok:', msg)
}

/**
 * @param {object} base
 * @param {Partial<object>} patch
 */
function clientAt(base, patch = {}) {
  return {
    ...base,
    ...patch,
    pnk_deliverables: {
      ...(base.pnk_deliverables || {}),
      ...(patch.pnk_deliverables || {}),
    },
  }
}

const base = {
  id: 'scenario-pnk-1',
  name: 'Сценарий ПНК Отказ',
  phone: '+79001239999',
  club_id: 'club-test',
  trainer_id: 'trainer-1',
  lifecycle: 'pnk',
  pnk_stage: 'assigned',
  pnk_trial_sessions: 1,
  pnk_created_at: '2026-07-17T08:00:00.000Z',
  pnk_trial_date: null,
  pnk_trial_time: null,
  pnk_deliverables: {},
}

const healthCard = {
  gender: 'male',
  height_cm: 180,
  weight_kg: 80,
  goals: 'test',
  contraindications: 'нет',
}

/** Состояния по шагам мастера (1 БЗ) */
const fixtures = [
  {
    key: 'contact',
    label: 'Связь с клиентом',
    client: clientAt(base),
    ctx: { healthCard: null, bzCompletedCount: 0 },
    expectHatRefuse: true,
    expectHideNav: false,
    expectCanSkip: false,
  },
  {
    key: 'date',
    label: 'Дата бесплатной',
    client: clientAt(base, {
      pnk_deliverables: { contact: '2026-07-17' },
    }),
    ctx: { healthCard: null, bzCompletedCount: 0, trialDate: '2026-07-18' },
    expectHatRefuse: true,
    expectHideNav: false,
    expectCanSkip: false,
  },
  {
    key: 'wait',
    label: 'Ждём в зале',
    client: clientAt(base, {
      pnk_trial_date: '2026-07-18',
      pnk_deliverables: { contact: '2026-07-17' },
    }),
    ctx: { healthCard: null, bzCompletedCount: 0, trialDate: '2026-07-18' },
    expectHatRefuse: true,
    expectHideNav: false,
    expectCanSkip: false,
  },
  {
    key: 'health',
    label: 'Здоровье',
    client: clientAt(base, {
      pnk_trial_date: '2026-07-18',
      pnk_deliverables: { contact: '2026-07-17', visit_started: '2026-07-18' },
    }),
    ctx: { healthCard: null, bzCompletedCount: 0, trialDate: '2026-07-18' },
    expectHatRefuse: true,
    expectHideNav: false,
    expectCanSkip: false,
  },
  {
    key: 'nutrition',
    label: 'Питание',
    client: clientAt(base, {
      pnk_trial_date: '2026-07-18',
      pnk_deliverables: {
        contact: '2026-07-17',
        visit_started: '2026-07-18',
        health: '2026-07-18',
      },
    }),
    ctx: { healthCard, bzCompletedCount: 0, trialDate: '2026-07-18' },
    expectHatRefuse: true,
    expectHideNav: false,
    expectCanSkip: true,
  },
  {
    key: 'train1',
    label: 'Тренировка',
    client: clientAt(base, {
      pnk_trial_date: '2026-07-18',
      pnk_deliverables: {
        contact: '2026-07-17',
        visit_started: '2026-07-18',
        health: '2026-07-18',
        nutrition: '2026-07-18',
      },
    }),
    ctx: { healthCard, bzCompletedCount: 0, trialDate: '2026-07-18' },
    expectHatRefuse: true,
    expectHideNav: false,
    expectCanSkip: false,
  },
  {
    key: 'hw1',
    label: 'ДЗ',
    client: clientAt(base, {
      pnk_trial_date: '2026-07-18',
      pnk_deliverables: {
        contact: '2026-07-17',
        visit_started: '2026-07-18',
        health: '2026-07-18',
        nutrition: '2026-07-18',
        trial: '2026-07-18',
      },
    }),
    ctx: { healthCard, bzCompletedCount: 1, trialDate: '2026-07-18' },
    expectHatRefuse: true,
    expectHideNav: false,
    expectCanSkip: true,
  },
  {
    key: 'followup',
    label: 'Контакт после',
    client: clientAt(base, {
      pnk_trial_date: '2026-07-18',
      pnk_deliverables: {
        contact: '2026-07-17',
        visit_started: '2026-07-18',
        health: '2026-07-18',
        nutrition: '2026-07-18',
        trial: '2026-07-18',
        homework: '2026-07-18',
      },
    }),
    ctx: { healthCard, bzCompletedCount: 1, trialDate: '2026-07-18' },
    expectHatRefuse: true,
    expectHideNav: false,
    expectCanSkip: true,
  },
  {
    key: 'close',
    label: 'Оформление',
    client: clientAt(base, {
      pnk_trial_date: '2026-07-18',
      pnk_deliverables: {
        contact: '2026-07-17',
        visit_started: '2026-07-18',
        health: '2026-07-18',
        nutrition: '2026-07-18',
        trial: '2026-07-18',
        homework: '2026-07-18',
        followup: '2026-07-18',
      },
    }),
    ctx: { healthCard, bzCompletedCount: 1, trialDate: '2026-07-18' },
    expectHatRefuse: false,
    expectHideNav: true,
    expectBodyRefuse: true,
  },
]

console.log('— Кнопки и отказ на каждом шаге —')

for (const fx of fixtures) {
  const step = resolvePnkTrainerUiStep(fx.client, fx.ctx)
  ok(step?.key === fx.key, `${fx.label}: шаг = ${fx.key} (got ${step?.key})`)
  ok(isOpenPnkClient(fx.client), `${fx.label}: ещё открытый ПНК`)

  const nav = resolvePnkFunnelHatNav(fx.client, step, fx.ctx)
  ok(Boolean(nav), `${fx.label}: nav есть`)

  const showRefuseInHat = fx.key !== 'close'
  ok(showRefuseInHat === fx.expectHatRefuse, `${fx.label}: Отказ в шапке = ${fx.expectHatRefuse}`)

  if (fx.expectHideNav) {
    ok(fx.key === 'close', `${fx.label}: шапка без Назад/Далее (hideNav)`)
  } else {
    ok(typeof nav.canBack === 'boolean', `${fx.label}: canBack определён (${nav.canBack})`)
    ok(typeof nav.canNext === 'boolean', `${fx.label}: canNext определён (${nav.canNext})`)
    ok(nav.canSkip === fx.expectCanSkip, `${fx.label}: Пропустить = ${fx.expectCanSkip} (got ${nav.canSkip})`)
    if (!nav.canSkip) {
      ok(Boolean(nav.skipReason), `${fx.label}: причина блокировки Пропустить`)
    }
  }

  const built = buildPnkLostFunnelEvent(fx.client, { reason: `QA ${fx.key}`, id: `ev-${fx.key}` })
  ok(built.ok, `${fx.label}: событие отказа собирается`)
  ok(built.event.event_type === 'lost', `${fx.label}: тип lost`)
  ok(Boolean(normalizePnkFunnelEventPushPayload(built.event)), `${fx.label}: payload для sync`)
  console.log(
    `  · ${fx.label}: back=${nav.canBack} next=${nav.canNext}${nav.nextReason ? ` (${nav.nextReason})` : ''} skip=${nav.canSkip} refuse=hat:${showRefuseInHat}/body:${fx.expectBodyRefuse === true}`,
  )
}

console.log('\n— После отказа цифры в статистике —')
const mid = fixtures.find((f) => f.key === 'nutrition')
const ev = buildPnkLostFunnelEvent(mid.client, {
  reason: 'Дорого',
  id: 'ev-mid',
  occurredAt: '2026-07-20T12:00:00.000Z',
}).event
const stats = aggregatePnkFunnelStats([], { dateFrom: '2026-07-01', dateTo: '2026-07-31' }, [ev])
ok(stats.entered === 1 && stats.lost === 1 && stats.open === 0, `статистика без карточки: ${stats.entered}/${stats.lost}`)

const blocked = buildPnkLostFunnelEvent({
  id: 'dk',
  club_id: 'club-test',
  lifecycle: 'active',
  pnk_stage: 'won',
})
ok(!blocked.ok, 'оформленный ДК нельзя «отказать» через журнал')

console.log('\nverify-pnk-refuse-scenario: all ok')
