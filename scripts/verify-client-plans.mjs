/**
 * Задание от тренера и питание в приложении клиента: белый список снимка, доступ на запись,
 * устаревший рацион, плитки /me, текст push и тихие часы, проводка таблицы в sync.
 */
import { readFileSync } from 'node:fs'
import {
  assertClientPlanPush,
  clientPlanMarkText,
  normalizeClientPlanPushPayload,
  sanitizeClientPlanPayload,
  shouldMarkClientPlanSeen,
  summarizeClientPlan,
} from '../src/lib/clientPlans/clientPlanCore.js'
import { buildHomeworkAppSnapshot } from '../src/lib/homework/homeworkAppSendCore.js'
import { buildNutritionAppSnapshot } from '../src/lib/nutrition/nutritionAppSendCore.js'
import { clientHomeworkTitle, clientPlanFresh, clientPlanTabTarget, markClientPlanSeen, planFootRu } from '../src/lib/client/clientPlanUiCore.js'
import { clientNutritionDayTabs, clientNutritionDayView } from '../src/lib/client/clientNutritionDayCore.js'
import { buildClientPlanPushPayload, notifyClientPlanSent, runClientPlanNotices } from '../api/_lib/clientPlans/clientPlanNotify.js'
import { PUSH_ALLOWED_TABLES } from '../api/_lib/pushRecordCore.js'
import { PULL_MERGE_GUARD_STORES } from '../src/lib/syncPullGuardCore.js'
import { SYNC_TABLE_PRIORITY } from '../src/lib/syncQueuePriorityCore.js'
import { normalizeTrainerPullPayload } from '../src/lib/trainerPullResponseCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const U = (n) => `00000000-0000-4000-8000-00000000000${n}`
const TRAINER = U(1)
const OTHER = U(2)
const CLIENT = U(3)
const CLUB = U(4)
const PLAN = U(5)
const TZ = 'Europe/Moscow'

// --- ДЗ: черновик → снимок без лишнего ---
const draft = {
  title: 'Спина',
  mode: 'preset',
  presetId: 'p1',
  comment: '  Через день, без боли  ',
  blocks: [
    { label: 'Основное', exercises: [{ catalog_exercise_id: 'x1', name: 'Планка', sets: 3, reps: '40 с', rest_sec: 30, note: 'секрет' }] },
    { label: 'Пустой', exercises: [] },
  ],
}
const hw = buildHomeworkAppSnapshot(draft)
ok(hw.ok && hw.payload.blocks.length === 1, 'ДЗ: пустой блок отброшен')
ok(hw.ok && !('catalog_exercise_id' in hw.payload.blocks[0].exercises[0]) && !('note' in hw.payload.blocks[0].exercises[0]), 'ДЗ: id справочника и лишние поля не уходят клиенту')
ok(hw.ok && hw.payload.comment === 'Через день, без боли', 'ДЗ: комментарий клиенту сохраняется (обрезан)')
ok(!buildHomeworkAppSnapshot({ blocks: [{ label: 'A', exercises: [] }] }).ok, 'ДЗ без упражнений не отправляется')
const huge = sanitizeClientPlanPayload('homework', {
  blocks: [{ label: 'A', exercises: Array.from({ length: 100 }, (_, i) => ({ name: `У${i}`, sets: 99, rest_sec: -5 })) }],
})
ok(huge.blocks[0].exercises.length === 40 && huge.blocks[0].exercises[0].sets === 20 && huge.blocks[0].exercises[0].rest_sec === 0, 'ДЗ: лимиты подходов, отдыха и числа упражнений')
ok(summarizeClientPlan('homework', hw.payload).count === 1, 'сводка ДЗ: число упражнений')

// --- Рацион: только сохранённый и свежий ---
const plan = {
  basis: { weightKg: 70, heightCm: 170 },
  kcalTarget: 1900,
  totals: { kcal: 1850.4, proteinG: 120, fatG: 60, carbsG: 200 },
  referents: { kcal: { min: 1 } },
  disclaimer: 'Не является медицинской рекомендацией',
  dayPlan: [
    { slot: 'b', label: 'Завтрак', subtotal: { kcal: 500 }, items: [{ productId: 'oats', label: 'Овсянка', portionLabel: '1 порция', grams: 60, kcal: 220, proteinG: 8, fatG: 4, carbsG: 38 }] },
  ],
}
const health = { height_cm: 170, current_weight_kg: 70, nutrition_survey: { illness: 'секрет' } }
const nu = buildNutritionAppSnapshot(plan, { health, goalKindLabel: 'Похудение' })
ok(nu.ok && nu.payload.totals.kcal === 1850 && nu.payload.meals[0].items[0].portion === '1 порция', 'рацион: снимок с порциями')
ok(nu.ok && !JSON.stringify(nu.payload).includes('секрет') && !('referents' in nu.payload) && !('basis' in nu.payload), 'рацион: без опросника, референтов и веса')
ok(buildNutritionAppSnapshot(plan, { health: { height_cm: 170, current_weight_kg: 75 } }).error === 'stale', 'устаревший рацион (вес изменился) — не отправляем')
ok(buildNutritionAppSnapshot(plan, { health, planUnsaved: true }).error === 'unsaved', 'несохранённый черновик — не отправляем')
ok(buildNutritionAppSnapshot(null, { health }).error === 'empty_plan', 'нет рациона — ошибка')

const weekPlan = {
  ...plan,
  days: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((label, i) => ({
    label,
    totals: { kcal: 1800 + i, proteinG: 100, fatG: 50, carbsG: 180 },
    dayPlan: [
      {
        label: i === 6 ? 'Ужин' : 'Завтрак',
        subtotal: { kcal: 400 },
        items: [{ label: i === 6 ? 'Рыба' : 'Овсянка', portionLabel: '1 порция', grams: 100, kcal: 200, proteinG: 10, fatG: 5, carbsG: 20 }],
      },
    ],
  })),
}
const weekSnap = buildNutritionAppSnapshot(weekPlan, { health, goalKindLabel: 'Похудение' })
ok(weekSnap.ok && weekSnap.payload.days?.length === 7, 'неделя: в снимок уходят все 7 дней')
const weekTabs = clientNutritionDayTabs(weekSnap.payload)
ok(weekTabs.length === 7 && weekTabs[0].short === 'Пн' && weekTabs[0].spoken === 'Понедельник', 'клиент: кнопки Пн… и полное имя дня')
ok(weekTabs[6].short === 'Вс' && weekTabs[6].meals[0].items[0].label === 'Рыба', 'клиент: воскресенье — свои блюда')
const sunday = clientNutritionDayView(weekSnap.payload, 6)
ok(sunday.spoken === 'Воскресенье' && sunday.totals.kcal === 1806, 'клиент: выбранный день меняет ккал')
ok(clientNutritionDayView(weekSnap.payload, 99).index === 6 && clientNutritionDayView(weekSnap.payload, -1).index === 0, 'клиент: чужой номер дня прижимается к краю')
ok(clientNutritionDayTabs(nu.payload).length === 0 && clientNutritionDayView(nu.payload, 2).meals[0].label === 'Завтрак', 'один день — без переключателя, блюда как были')
const three = clientNutritionDayTabs({
  days: [1, 2, 3].map((n) => ({ label: `День ${n}`, meals: [{ label: 'Обед', items: [{ label: 'Гречка' }] }], totals: { kcal: n } })),
})
ok(three.length === 3 && three[2].short === '3' && three[2].spoken === 'День 3', '3–5 дней: на кнопке номер, в подписи «День N»')

// --- Запись в очередь → колонки ---
const row = { id: PLAN, client_id: CLIENT, club_id: CLUB, kind: 'homework', payload: hw.payload, sent_by: TRAINER, sent_at: '2026-10-10T15:40:00Z', client_seen_at: '2026-10-10T16:00:00Z', notified_at: 'x' }
const norm = normalizeClientPlanPushPayload(row)
ok(norm.ok && !('client_seen_at' in norm.data) && !('notified_at' in norm.data), 'с планшета нельзя поставить «просмотрено» / «уведомлено»')
ok(norm.ok && norm.data.summary.count === 1, 'summary для плитки считает сервер')
ok(!normalizeClientPlanPushPayload({ ...row, kind: 'salary' }).ok, 'неизвестный вид — отказ')
ok(!normalizeClientPlanPushPayload({ ...row, payload: { blocks: [] } }).ok, 'пустой снимок — отказ')
ok(!normalizeClientPlanPushPayload({ ...row, client_id: 'abc' }).ok, 'битый client_id — отказ')

// --- Доступ ---
const client = { id: CLIENT, trainer_id: TRAINER, club_id: CLUB, archived_at: null }
const payload = { ...row }
ok(assertClientPlanPush({ op: 'insert', isTrainer: true, userId: TRAINER, payload, client }).ok, 'тренер клиента — можно')
ok(!assertClientPlanPush({ op: 'insert', isTrainer: true, userId: OTHER, payload: { ...payload, sent_by: OTHER }, client }).ok, 'чужой тренер — отказ')
ok(!assertClientPlanPush({ op: 'insert', isTrainer: true, userId: OTHER, payload, client }).ok, 'подмена sent_by — отказ')
ok(assertClientPlanPush({ op: 'insert', isAdmin: true, userId: OTHER, payload: { ...payload, sent_by: OTHER }, client }).ok, 'главный админ — можно любому клиенту')
ok(!assertClientPlanPush({ op: 'insert', userId: OTHER, payload: { ...payload, sent_by: OTHER }, client }).ok, 'менеджер / управляющий — отказ')
ok(!assertClientPlanPush({ op: 'update', isTrainer: true, userId: TRAINER, payload, client }).ok, 'правка отправленного — отказ')
ok(!assertClientPlanPush({ op: 'delete', isAdmin: true, userId: TRAINER, payload, client }).ok, 'удаление — отказ')
ok(!assertClientPlanPush({ op: 'insert', isTrainer: true, userId: TRAINER, payload, client: { ...client, archived_at: '2026-01-01' } }).ok, 'клиент в архиве — отказ')
ok(!assertClientPlanPush({ op: 'insert', isTrainer: true, userId: TRAINER, payload: { ...payload, club_id: OTHER }, client }).ok, 'чужой club_id — отказ')
ok(!assertClientPlanPush({ op: 'insert', isTrainer: true, userId: TRAINER, payload, client: null }).ok, 'нет клиента — отказ')

// --- «Прочитал» только у последнего рациона, не у архива ---
ok(shouldMarkClientPlanSeen(PLAN, PLAN), 'открыл последний — ставим client_seen_at')
ok(!shouldMarkClientPlanSeen(PLAN, U(9)), 'открыл старый из «Прошлых» — не шумим тренеру')
ok(!shouldMarkClientPlanSeen(null, PLAN) && !shouldMarkClientPlanSeen(PLAN, null), 'нет id — не ставим')
ok(/shouldMarkClientPlanSeen/.test(readFileSync('api/_lib/clientPlans/clientPlansClientHandler.js', 'utf8')), 'сервер: mark только для последнего')

// --- Подпись у тренера ---
ok(clientPlanMarkText({ sent_at: '2026-10-10T15:40:00Z' }, TZ) === 'Отправлено 10.10, 18:40', 'подпись «Отправлено»')
ok(clientPlanMarkText({ sent_at: '2026-10-10T15:40:00Z', synced: false }, TZ).includes('уйдёт, когда появится связь'), 'без сети — честная подпись')
ok(clientPlanMarkText({ sent_at: '2026-10-10T15:40:00Z', client_seen_at: '2026-10-10T16:02:00Z' }, TZ) === 'Клиент открыл 10.10, 19:02', 'подпись «Клиент открыл»')
ok(clientPlanMarkText(null) === '', 'нет отправок — без подписи')

// --- Вкладки клиента ---
const brief = { id: PLAN, kind: 'homework', sent_at: '2026-10-08T09:00:00Z', trainer_name: 'Анна Иванова', seen: false, summary: { title: 'Спина', count: 6 } }
const plans = { homework: brief, nutrition: null }
ok(clientPlanFresh(plans, 'homework') && !clientPlanFresh(plans, 'nutrition'), 'точка «Новое» — только на присланном и не открытом')
ok(!clientPlanFresh(undefined, 'homework'), 'нет данных — без точки')
const seen = markClientPlanSeen(plans, PLAN)
ok(!clientPlanFresh(seen, 'homework') && plans.homework.seen === false, 'открыл — «новое» гаснет, исходный ответ не мутирует')
ok(markClientPlanSeen(plans, 'другой-id') === plans, 'открыл старое из «Прошлых» — точка у нового остаётся')
ok(planFootRu(brief, TZ) === 'от 08.10 · Анна', 'подпись «от 08.10 · Анна»')
const freshFood = { homework: { ...brief, seen: true }, nutrition: { ...brief, id: 'n1', kind: 'nutrition' } }
ok(clientPlanTabTarget(freshFood) === '/me/nutrition', 'вкладка «От тренера»: новый только рацион — сразу питание')
ok(clientPlanTabTarget(plans) === '/me/task' && clientPlanTabTarget(undefined) === '/me/task', 'иначе — задание')
ok(clientHomeworkTitle('Домашнее задание') === 'Упражнения' && clientHomeworkTitle('') === 'Упражнения', 'клиенту не пишем «Домашнее задание»')
ok(clientHomeworkTitle('Спина и пресс') === 'Спина и пресс', 'свой заголовок тренера остаётся')

// --- Push ---
const push = buildClientPlanPushPayload({ kind: 'homework', trainerName: 'Анна Иванова', clubName: 'FIT-CITY' })
ok(push.title === 'FIT-CITY' && push.body === 'Тренер Анна: новое задание' && push.url === '/me/task', 'push о задании')
ok(buildClientPlanPushPayload({ kind: 'nutrition' }).body === 'Рацион питания от тренера', 'push без имени тренера')
delete process.env.VAPID_PUBLIC_KEY
delete process.env.VAPID_PRIVATE_KEY
const failDb = { from: () => { throw new Error('в базу не ходим') } }
ok((await notifyClientPlanSent(failDb, { id: PLAN }, { now: new Date('2026-10-10T20:30:00Z') })).skipped === 'quiet', 'в 23:30 по клубу push не шлём (догонит cron утром)')
ok((await notifyClientPlanSent(failDb, { id: PLAN }, { now: new Date('2026-10-10T05:59:00Z') })).skipped === 'quiet', 'в 8:59 — ещё тихо')
ok((await runClientPlanNotices({ db: failDb, now: new Date('2026-10-10T19:30:00Z') })).skipped === 'quiet', 'cron в 22:30 молчит')
ok((await notifyClientPlanSent(failDb, { id: PLAN }, { now: new Date('2026-10-10T09:00:00Z') })).skipped === 'vapid_not_configured', 'днём тихие часы не мешают (дальше только ключи push)')

// --- Проводка таблицы ---
const tabletPushTables = readFileSync('src/lib/syncApiClient.js', 'utf8').match(/PUSH_TABLES = new Set\(\[([^\]]*)\]/)?.[1] ?? ''
const autoPushTables = readFileSync('src/lib/syncService.js', 'utf8').match(/AUTO_PUSH_TABLES = new Set\(\[([^\]]*)\]/)?.[1] ?? ''
ok(PUSH_ALLOWED_TABLES.has('client_plans') && tabletPushTables.includes("'client_plans'") && autoPushTables.includes("'client_plans'"), 'client_plans в allowlist push (сервер и планшет) и уходит сразу')
ok(PULL_MERGE_GUARD_STORES.has('client_plans'), 'pull не затирает неотправленное')
ok(SYNC_TABLE_PRIORITY.client_plans > SYNC_TABLE_PRIORITY.clients, 'отправка после клиента (FK)')
ok(normalizeTrainerPullPayload({ client_plans: [{ id: PLAN }] }).client_plans.length === 1, 'trainer-pull: отметки доходят до планшета')
const pullSrc = readFileSync('api/trainer-pull.js', 'utf8')
ok(/from\('client_plans'\)\s*\.select\('[^']*'\)/.test(pullSrc) && !/from\('client_plans'\)\s*\.select\('[^']*payload/.test(pullSrc), 'trainer-pull: без снимка (лёгкий ответ)')
const handlerSrc = readFileSync('api/_lib/clientPlans/clientPlansClientHandler.js', 'utf8')
ok((handlerSrc.match(/\.eq\('client_id', ctx\.clientId\)/g) ?? []).length >= 2, 'клиент читает только свои задания')

if (failed) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nAll client plans checks passed.')
