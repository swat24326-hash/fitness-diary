/**
 * Агрегаты воронки ПНК для менеджера и тренера (без React/IDB).
 */
import {
  buildPnkAttentionFlags,
  isOpenPnkClient,
  isPnkLifecycleClient,
  parsePnkDeliverables,
  pnkPackageProgress,
} from './pnkStagesCore.js'
import { peekPnkBzCompletedCount } from './pnkBzCompletedCore.js'

/**
 * @param {string} iso
 * @param {string} from
 * @param {string} to
 */
function inPeriod(iso, from, to) {
  const d = String(iso ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false
  if (from && d < from) return false
  if (to && d > to) return false
  return true
}

/**
 * Дата «входа» в воронку.
 * @param {object} c
 */
export function pnkEnteredAt(c) {
  return String(c?.pnk_created_at ?? c?.created_at ?? '').slice(0, 10)
}

function hasPnkTrace(c) {
  if (isPnkLifecycleClient(c)) return true
  if (c?.pnk_won_at || c?.pnk_created_at) return true
  if (c?.pnk_stage != null && String(c.pnk_stage) !== '') return true
  return false
}

/**
 * @param {object[]} clients
 * @param {{ dateFrom?: string, dateTo?: string, trainerId?: string }} [opts]
 * @param {object[]} [events] — анонимный журнал (отказы без карточки)
 */
export function aggregatePnkFunnelStats(clients, opts = {}, events = []) {
  const from = String(opts.dateFrom ?? '').slice(0, 10)
  const to = String(opts.dateTo ?? '').slice(0, 10)
  const trainerFilter = opts.trainerId != null ? String(opts.trainerId).trim() : ''
  const periodActive = Boolean(from && to)

  let entered = 0
  let won = 0
  let lost = 0
  let open = 0
  let cohortWon = 0
  let withNutrition = 0
  let withHomework = 0
  let packageDone = 0
  let trialDone = 0
  /** @type {Map<string, { trainerId: string, entered: number, won: number, lost: number, open: number, nutrition: number, homework: number, cohortWon: number }>} */
  const byTrainer = new Map()

  function bumpTrainer(tid, field) {
    if (!tid) return
    let row = byTrainer.get(tid)
    if (!row) {
      row = {
        trainerId: tid,
        entered: 0,
        won: 0,
        lost: 0,
        open: 0,
        nutrition: 0,
        homework: 0,
        cohortWon: 0,
      }
      byTrainer.set(tid, row)
    }
    row[field]++
  }

  for (const c of clients ?? []) {
    if (!hasPnkTrace(c)) continue

    const tid = String(c?.trainer_id ?? '').trim()
    if (trainerFilter && tid !== trainerFilter) continue

    const enteredIso = pnkEnteredAt(c)
    const enteredInPeriod = periodActive ? inPeriod(enteredIso, from, to) : Boolean(enteredIso)
    const wonAt = String(c?.pnk_won_at ?? '').slice(0, 10)
    const lostAt = String(c?.pnk_lost_at ?? '').slice(0, 10)
    const wonInPeriod = periodActive ? inPeriod(wonAt, from, to) : Boolean(wonAt)
    const lostInPeriod = periodActive ? inPeriod(lostAt, from, to) : Boolean(lostAt)

    if (enteredInPeriod) {
      entered++
      bumpTrainer(tid, 'entered')
      const d = parsePnkDeliverables(c.pnk_deliverables)
      if (d.trial) trialDone++
      const pkg = pnkPackageProgress(c)
      if (pkg.nutrition) {
        withNutrition++
        bumpTrainer(tid, 'nutrition')
      }
      if (pkg.homework) {
        withHomework++
        bumpTrainer(tid, 'homework')
      }
      if (pkg.done) packageDone++
      // Конверсия когорты вошедших: оформление до конца периода (не «чужие» won).
      if (wonAt && (!periodActive || !to || wonAt <= to)) {
        cohortWon++
        bumpTrainer(tid, 'cohortWon')
      }
    }

    if (wonInPeriod) {
      won++
      bumpTrainer(tid, 'won')
    }

    if (lostInPeriod) {
      lost++
      bumpTrainer(tid, 'lost')
    }

    // «В работе» в периоде — только открытые из когорты входа; без периода — все открытые.
    if (isOpenPnkClient(c) && (!periodActive || enteredInPeriod)) {
      open++
      bumpTrainer(tid, 'open')
    }
  }

  for (const ev of events ?? []) {
    if (String(ev?.event_type ?? '') !== 'lost') continue
    const tid = String(ev?.trainer_id ?? '').trim()
    if (trainerFilter && tid !== trainerFilter) continue

    const enteredIso = String(ev?.entered_at ?? ev?.occurred_at ?? '').slice(0, 10)
    const lostAt = String(ev?.occurred_at ?? '').slice(0, 10)
    const enteredInPeriod = periodActive ? inPeriod(enteredIso, from, to) : Boolean(enteredIso)
    const lostInPeriod = periodActive ? inPeriod(lostAt, from, to) : Boolean(lostAt)

    if (enteredInPeriod) {
      entered++
      bumpTrainer(tid, 'entered')
      if (ev.trial_done === true) trialDone++
      if (ev.had_nutrition === true) {
        withNutrition++
        bumpTrainer(tid, 'nutrition')
      }
      if (ev.had_homework === true) {
        withHomework++
        bumpTrainer(tid, 'homework')
      }
      if (ev.package_done === true) packageDone++
    }

    if (lostInPeriod) {
      lost++
      bumpTrainer(tid, 'lost')
    }
  }

  const conversionPct = entered > 0 ? Math.round((cohortWon / entered) * 1000) / 10 : 0
  const nutritionPct = entered > 0 ? Math.round((withNutrition / entered) * 1000) / 10 : 0
  const homeworkPct = entered > 0 ? Math.round((withHomework / entered) * 1000) / 10 : 0

  const trainers = [...byTrainer.values()]
    .map((row) => ({
      trainerId: row.trainerId,
      entered: row.entered,
      won: row.won,
      lost: row.lost,
      open: row.open,
      nutrition: row.nutrition,
      homework: row.homework,
      conversionPct: row.entered > 0 ? Math.round((row.cohortWon / row.entered) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.entered - a.entered || b.won - a.won)

  return {
    entered,
    won,
    lost,
    open,
    trialDone,
    withNutrition,
    withHomework,
    packageDone,
    conversionPct,
    nutritionPct,
    homeworkPct,
    trainers,
  }
}

/**
 * @param {object[]} clients
 * @param {Date} [now]
 * @param {{ bzCompletedByClient?: Record<string, number> | null }} [opts]
 */
export function listPnkAttentionClients(clients, now = new Date(), opts = {}) {
  const bzByClient = opts.bzCompletedByClient ?? null
  const rows = []
  for (const c of clients ?? []) {
    if (!isOpenPnkClient(c)) continue
    const bzCompletedCount = peekPnkBzCompletedCount(bzByClient, c?.id)
    const flags = buildPnkAttentionFlags(c, now, { bzCompletedCount })
    if (!flags.length) continue
    rows.push({
      id: c.id,
      name: String(c.name ?? '').trim() || '—',
      trainer_id: c.trainer_id ?? null,
      pnk_stage: c.pnk_stage,
      pnk_trial_date: c.pnk_trial_date ?? null,
      pnk_trial_time: c.pnk_trial_time ?? null,
      pnk_comment: c.pnk_comment ?? null,
      flags,
      tone: flags.some((f) => f.tone === 'hot') ? 'hot' : 'warn',
    })
  }
  rows.sort((a, b) => {
    if (a.tone !== b.tone) return a.tone === 'hot' ? -1 : 1
    return String(a.name).localeCompare(String(b.name), 'ru')
  })
  return rows
}
