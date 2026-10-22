/**
 * Формулы недели авто-ДЗ по целям: какие типы движений в основной части занятий А/Б/В
 * и как растёт нагрузка по неделям блока. Канон — docs/HOMEWORK_AUTO.md.
 */

export const HOMEWORK_SESSION_KEYS = ['А', 'Б', 'В']
export const HOMEWORK_BLOCK_WEEKS = 4

/** 1, 2 или 3 занятия. Пустое и любое другое число — 2, как раньше. */
export function homeworkSessionsCount(value) {
  const n = Math.round(Number(value))
  return n === 1 || n === 3 ? n : 2
}

/**
 * circuit — круговая: упражнения подряд на время, sets = число кругов;
 * sets — подходы: все подходы упражнения, потом следующее.
 * extra — добавочный слот по акценту (пол клиента), только у силовых целей.
 */
export const HOMEWORK_GOAL_FORMULAS = {
  fat_loss: {
    format: 'circuit',
    sessions: [
      ['squat', 'push', 'cardio', 'glute', 'core', 'cardio'],
      ['lunge', 'pull', 'cardio', 'hinge', 'core', 'cardio'],
      ['squat', 'pull', 'cardio', 'lunge', 'push', 'cardio'],
    ],
    rounds: [3, 4, 4],
    workSec: 30,
    rest: 20,
  },
  endurance: {
    format: 'circuit',
    sessions: [
      ['cardio', 'squat', 'cardio', 'core', 'cardio', 'lunge'],
      ['cardio', 'lunge', 'cardio', 'push', 'cardio', 'core'],
      ['cardio', 'glute', 'cardio', 'pull', 'cardio', 'squat'],
    ],
    rounds: [3, 4, 4],
    workSec: 40,
    rest: 20,
  },
  tone: {
    format: 'sets',
    sessions: [
      ['squat', 'push', 'hinge', 'pull', 'core'],
      ['lunge', 'pull', 'glute', 'push', 'core'],
      ['squat', 'pull', 'glute', 'push', 'core'],
    ],
    extra: { lower: ['glute', 'glute', 'lunge'], upper: ['push', 'pull', 'push'] },
    sets: [3, 3, 4],
    reps: [10, 12, 12],
    sec: [20, 30, 40],
    rest: 60,
  },
  general: {
    format: 'sets',
    sessions: [
      ['squat', 'push', 'pull', 'core', 'cardio'],
      ['lunge', 'hinge', 'push', 'core', 'cardio'],
      ['glute', 'pull', 'squat', 'core', 'cardio'],
    ],
    extra: { lower: ['glute', 'glute', 'lunge'], upper: ['push', 'pull', 'push'] },
    sets: [2, 3, 3],
    reps: [10, 12, 12],
    sec: [20, 30, 30],
    rest: 45,
  },
  posture: {
    format: 'sets',
    sessions: [
      ['pull', 'glute', 'core', 'hinge', 'mobility'],
      ['pull', 'core', 'glute', 'pull', 'stretch'],
      ['pull', 'core', 'hinge', 'core', 'mobility'],
    ],
    sets: [2, 3, 3],
    reps: [8, 10, 12],
    sec: [20, 30, 40],
    rest: 30,
  },
  mobility: {
    format: 'sets',
    sessions: [
      ['mobility', 'stretch', 'mobility', 'stretch', 'core'],
      ['mobility', 'stretch', 'hinge', 'stretch', 'mobility'],
      ['mobility', 'mobility', 'stretch', 'stretch', 'core'],
    ],
    sets: [2, 2, 3],
    reps: [6, 8, 10],
    sec: [30, 30, 40],
    rest: 15,
  },
}

/**
 * Нагрузка в неделю блока: недели 1–3 растут повторы / секунды, 4-я — плюс подход или круг
 * при нагрузке 3-й недели (не два шага сразу).
 * @param {keyof typeof HOMEWORK_GOAL_FORMULAS} goal
 * @param {number} level 1..3
 * @param {number} week 1..4
 * @param {'reps' | 'sec'} unit
 */
export function homeworkMainDose(goal, level, week, unit) {
  const f = HOMEWORK_GOAL_FORMULAS[goal]
  const li = Math.min(3, Math.max(1, level)) - 1
  const w = Math.min(HOMEWORK_BLOCK_WEEKS, Math.max(1, week)) - 1
  const bonus = w === HOMEWORK_BLOCK_WEEKS - 1 ? 1 : 0
  const step = Math.min(w, HOMEWORK_BLOCK_WEEKS - 2)
  if (f.format === 'circuit') {
    return { sets: f.rounds[li] + bonus, amount: f.workSec + 5 * step, unit: 'sec', rest: f.rest }
  }
  const amount = unit === 'sec' ? f.sec[li] + 5 * step : f.reps[li] + 2 * step
  return { sets: f.sets[li] + bonus, amount, unit, rest: f.rest }
}
