/**
 * Генератор недели авто-ДЗ: 2–3 занятия «разминка → основная часть → заминка» из библиотеки.
 * Набор упражнений зависит от seed + variant (блок на 3–4 недели), от week — только нагрузка.
 * Результат — обычный черновик ДЗ (homeworkPlanCore), тренер правит и отправляет как сейчас.
 */

import {
  HOMEWORK_LIBRARY,
  filterHomeworkLibrary,
  homeworkDumbbellNote,
} from '../library/homeworkLibrary.js'
import { HOMEWORK_GOALS } from '../library/homeworkLibraryTags.js'
import {
  HOMEWORK_BLOCK_WEEKS,
  HOMEWORK_GOAL_FORMULAS,
  HOMEWORK_SESSION_KEYS,
  homeworkMainDose,
} from './homeworkGoalFormulas.js'

const WARMUP_COUNT = 3
const COOLDOWN_COUNT = 3

/** @param {string} s */
function hashSeed(s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Детерминированный генератор: один и тот же seed — одна и та же неделя. */
function makeRandom(seed) {
  let a = hashSeed(seed)
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Упражнения уровня клиента выпадают вдвое чаще более лёгких. */
function pick(candidates, used, level, random) {
  const fresh = candidates.filter((e) => !used.has(e.id))
  const pool = fresh.length ? fresh : candidates
  if (!pool.length) return null
  const weights = pool.map((e) => (e.level === level ? 2 : 1))
  let r = random() * weights.reduce((a, b) => a + b, 0)
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i]
    if (r < 0) return pool[i]
  }
  return pool[pool.length - 1]
}

/** «12», «30 сек», «12 / сторона» — короче 20 символов (лимит снимка клиента). */
function repsText(amount, unit, side) {
  const base = unit === 'sec' ? `${amount} сек` : String(amount)
  return side ? `${base} / сторона` : base
}

function toItem(entry, sets, amount, unit, rest, byId) {
  const note = homeworkDumbbellNote(entry, byId)
  return {
    catalog_exercise_id: null,
    library_id: entry.id,
    name: entry.name,
    sets,
    reps: repsText(amount, unit, entry.side),
    rest_sec: rest,
    how: entry.how,
    tip: note ? `${entry.cue}. ${note}` : entry.cue,
  }
}

/** Слоты основной части занятия с учётом акцента по полу. */
function sessionSlots(formula, sessionIdx, emphasis) {
  const slots = [...formula.sessions[sessionIdx]]
  const extra = formula.extra?.[emphasis]?.[sessionIdx]
  if (extra) slots.push(extra)
  return slots
}

function commentText(format, week, sessions) {
  const how =
    format === 'circuit'
      ? 'Основная часть — по кругу: упражнения подряд, отдых между ними как указано, после круга 1–2 минуты.'
      : 'Основная часть: сделайте все подходы одного упражнения, потом переходите к следующему.'
  return `${sessions} занятия в неделю, между ними день отдыха. ${how} Неделя ${week} из ${HOMEWORK_BLOCK_WEEKS}: нагрузка понемногу растёт. Боль — остановитесь и напишите тренеру.`
}

/**
 * @param {{
 *   goal: string,
 *   level?: number,
 *   avoid?: string[],
 *   equipment?: string[],
 *   noImpact?: boolean,
 *   sex?: 'male' | 'female' | null,
 *   sessions?: number,
 *   week?: number,
 *   seed?: string,
 *   variant?: number,
 *   library?: import('../library/homeworkLibrary.js').HomeworkLibraryEntry[],
 * }} opts
 * @returns {{ ok: true, draft: import('../homeworkPlanCore.js').HomeworkDraft, skipped: string[] } | { ok: false, error: 'unknown_goal' | 'no_exercises' }}
 */
export function generateHomeworkWeek(opts) {
  const formula = HOMEWORK_GOAL_FORMULAS[opts?.goal]
  if (!formula) return { ok: false, error: 'unknown_goal' }
  const goal = opts.goal
  const library = opts.library ?? HOMEWORK_LIBRARY
  const byId = new Map(library.map((e) => [e.id, e]))
  const level = Math.min(3, Math.max(1, Math.round(Number(opts.level) || 1)))
  const week = Math.min(HOMEWORK_BLOCK_WEEKS, Math.max(1, Math.round(Number(opts.week) || 1)))
  const sessions = opts.sessions === 3 ? 3 : 2
  const emphasis = opts.sex === 'female' ? 'lower' : opts.sex === 'male' ? 'upper' : null
  const random = makeRandom(`${opts.seed ?? ''}:${goal}:${level}:${opts.variant ?? 0}`)
  const base = {
    maxLevel: level,
    avoid: opts.avoid ?? [],
    equipment: opts.equipment,
    allowImpact: level >= 2 && !opts.noImpact,
  }

  const usedMain = new Set()
  const skipped = []
  const blocks = []

  for (let s = 0; s < sessions; s++) {
    const key = HOMEWORK_SESSION_KEYS[s]
    const used = new Set()

    const warmup = []
    const warmPool = filterHomeworkLibrary(library, { ...base, phase: 'warmup', allowImpact: false })
    const warmCardio = warmPool.filter((e) => e.pattern === 'cardio')
    const warmJoints = warmPool.filter((e) => e.pattern !== 'cardio')
    for (let i = 0; i < WARMUP_COUNT; i++) {
      const e = pick(i === 0 && warmCardio.length ? warmCardio : warmJoints.length ? warmJoints : warmPool, used, level, random)
      if (!e || used.has(e.id)) break
      used.add(e.id)
      warmup.push(toItem(e, 1, e.unit === 'sec' ? 40 : 10, e.unit, 0, byId))
    }

    const main = []
    for (const pattern of sessionSlots(formula, s, emphasis)) {
      let pool = filterHomeworkLibrary(library, { ...base, goal, pattern, phase: 'main' })
      if (!pool.length) pool = filterHomeworkLibrary(library, { ...base, pattern, phase: 'main' })
      const e = pick(pool.filter((x) => !used.has(x.id)), usedMain, level, random)
      if (!e) {
        skipped.push(`${key}: ${pattern}`)
        continue
      }
      used.add(e.id)
      usedMain.add(e.id)
      const dose = homeworkMainDose(goal, level, week, e.unit)
      main.push(toItem(e, dose.sets, dose.amount, dose.unit, dose.rest, byId))
    }

    const cooldown = []
    const coolPool = filterHomeworkLibrary(library, { ...base, phase: 'cooldown', allowImpact: false })
    for (let i = 0; i < COOLDOWN_COUNT; i++) {
      const e = pick(coolPool, used, level, random)
      if (!e || used.has(e.id)) break
      used.add(e.id)
      cooldown.push(toItem(e, 1, e.unit === 'sec' ? 30 : 8, e.unit, 0, byId))
    }

    if (!main.length) continue
    const rounds = main[0].sets
    const mainLabel = formula.format === 'circuit' ? `Круговая, ${rounds} ${rounds >= 5 ? 'кругов' : 'круга'}` : 'Основная часть'
    if (warmup.length) blocks.push({ label: `Занятие ${key} · Разминка`, exercises: warmup })
    blocks.push({ label: `Занятие ${key} · ${mainLabel}`, exercises: main })
    if (cooldown.length) blocks.push({ label: `Занятие ${key} · Заминка`, exercises: cooldown })
  }

  if (!blocks.length) return { ok: false, error: 'no_exercises' }
  return {
    ok: true,
    skipped,
    draft: {
      title: `Домашние тренировки · ${HOMEWORK_GOALS[goal]}`,
      mode: 'auto',
      presetId: null,
      comment: commentText(formula.format, week, sessions),
      blocks,
    },
  }
}
