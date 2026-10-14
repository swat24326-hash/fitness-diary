/**
 * Библиотека домашних упражнений с метками — источник для генератора авто-ДЗ.
 * Канон: docs/HOMEWORK_AUTO.md. Проверка: scripts/verify-homework-library.mjs.
 */

import {
  HOMEWORK_AVOID,
  HOMEWORK_DEFAULT_EQUIPMENT,
  HOMEWORK_EQUIPMENT,
  HOMEWORK_FOCUS,
  HOMEWORK_GOALS,
  HOMEWORK_LEVELS,
  HOMEWORK_PATTERNS,
  HOMEWORK_PHASES,
  HOMEWORK_UNITS,
} from './homeworkLibraryTags.js'
import { LIBRARY_LEGS } from './libraryLegs.js'
import { LIBRARY_UPPER } from './libraryUpper.js'
import { LIBRARY_CORE } from './libraryCore.js'
import { LIBRARY_CARDIO } from './libraryCardio.js'
import { LIBRARY_MOBILITY } from './libraryMobility.js'

/**
 * how — как выполнять простыми словами (исходное положение и движение); cue — главная ошибка техники.
 * household / alt — только у гантелей: чем заменить дома и какое упражнение без гантелей.
 * phases — только если часть занятия отличается от правила homeworkEntryPhases.
 * @typedef {{
 *   id: string,
 *   name: string,
 *   pattern: keyof typeof HOMEWORK_PATTERNS,
 *   level: 1 | 2 | 3,
 *   equip: keyof typeof HOMEWORK_EQUIPMENT,
 *   household?: string,
 *   alt?: string,
 *   unit: keyof typeof HOMEWORK_UNITS,
 *   phases?: Array<keyof typeof HOMEWORK_PHASES>,
 *   side?: boolean,
 *   impact?: boolean,
 *   avoid: Array<keyof typeof HOMEWORK_AVOID>,
 *   goals: Array<keyof typeof HOMEWORK_GOALS>,
 *   focus: keyof typeof HOMEWORK_FOCUS,
 *   how: string,
 *   cue: string,
 * }} HomeworkLibraryEntry
 */

/** @type {HomeworkLibraryEntry[]} */
export const HOMEWORK_LIBRARY = [
  ...LIBRARY_LEGS,
  ...LIBRARY_UPPER,
  ...LIBRARY_CORE,
  ...LIBRARY_CARDIO,
  ...LIBRARY_MOBILITY,
]

/**
 * Части занятия: растяжка — заминка; мобильность — разминка; обе — ещё и основная часть
 * (в неё попадают только при цели мобильность / осанка — отбор по goals).
 * Лёгкое кардио без прыжков — разминка и основная часть; остальное — основная часть.
 * @param {HomeworkLibraryEntry} e
 */
export function homeworkEntryPhases(e) {
  if (e.phases?.length) return e.phases
  if (e.pattern === 'stretch') return ['main', 'cooldown']
  if (e.pattern === 'mobility') return ['warmup', 'main']
  if (e.pattern === 'cardio' && e.level === 1 && !e.impact) return ['warmup', 'main']
  return ['main']
}

/**
 * Ошибки одной записи (пустой массив — запись корректна).
 * @param {HomeworkLibraryEntry} e
 * @returns {string[]}
 */
export function validateHomeworkLibraryEntry(e) {
  const errors = []
  if (!/^[a-z0-9_]+$/.test(String(e?.id ?? ''))) errors.push('id: только a-z, 0-9, _')
  const name = String(e?.name ?? '').trim()
  if (!name || name.length > 120) errors.push('name: пусто или длиннее 120')
  if (!(e?.pattern in HOMEWORK_PATTERNS)) errors.push(`pattern: ${e?.pattern}`)
  if (!(String(e?.level) in HOMEWORK_LEVELS)) errors.push(`level: ${e?.level}`)
  if (!(e?.equip in HOMEWORK_EQUIPMENT)) errors.push(`equip: ${e?.equip}`)
  if (!(e?.unit in HOMEWORK_UNITS)) errors.push(`unit: ${e?.unit}`)
  if (!(e?.focus in HOMEWORK_FOCUS)) errors.push(`focus: ${e?.focus}`)
  if (e?.phases !== undefined && (!Array.isArray(e.phases) || !e.phases.length || e.phases.some((p) => !(p in HOMEWORK_PHASES)))) {
    errors.push('phases: пусто или неизвестная часть занятия')
  }
  if (!Array.isArray(e?.avoid) || e.avoid.some((a) => !(a in HOMEWORK_AVOID))) errors.push('avoid: неизвестная метка')
  if (!Array.isArray(e?.goals) || !e.goals.length || e.goals.some((g) => !(g in HOMEWORK_GOALS))) {
    errors.push('goals: пусто или неизвестная цель')
  }
  const how = String(e?.how ?? '').trim()
  if (!how || how.length > 220) errors.push('how: пусто или длиннее 220')
  const cue = String(e?.cue ?? '').trim()
  if (!cue || cue.length > 100) errors.push('cue: пусто или длиннее 100')
  if (e?.impact && (e.level < 2 || !e.avoid?.includes('knees'))) {
    errors.push('impact: прыжки — уровень от 2 и avoid knees')
  }
  if (e?.equip === 'dumbbells') {
    const household = String(e.household ?? '').trim()
    if (!household || household.length > 80) errors.push('household: у гантелей нужна домашняя замена до 80 символов')
    if (!e.alt) errors.push('alt: у гантелей нужно упражнение-замена')
  } else if (e?.household || e?.alt) {
    errors.push('household/alt: только для гантелей')
  }
  return errors
}

/**
 * Замены гантелей во всей библиотеке: alt существует, тот же тип движения, без гантелей
 * и не добавляет клиенту новых ограничений.
 * @param {HomeworkLibraryEntry[]} library
 * @returns {string[]}
 */
export function validateHomeworkLibraryAlts(library) {
  const byId = new Map((library ?? []).map((e) => [e.id, e]))
  const errors = []
  for (const e of library ?? []) {
    if (!e.alt) continue
    const alt = byId.get(e.alt)
    if (!alt) {
      errors.push(`${e.id}: alt ${e.alt} не найден`)
      continue
    }
    if (alt.equip === 'dumbbells') errors.push(`${e.id}: alt тоже с гантелями`)
    if (alt.pattern !== e.pattern) errors.push(`${e.id}: alt другого типа движения`)
    if (alt.avoid.some((a) => !e.avoid.includes(a))) errors.push(`${e.id}: alt добавляет ограничение`)
  }
  return errors
}

/**
 * Подсказка клиенту под упражнением с гантелями; для остальных — null.
 * @param {HomeworkLibraryEntry} e
 * @param {Map<string, HomeworkLibraryEntry>} byId
 */
export function homeworkDumbbellNote(e, byId) {
  if (e?.equip !== 'dumbbells') return null
  const alt = byId.get(e.alt ?? '')
  const altText = alt ? ` или замените на «${alt.name}»` : ''
  return `Нет гантелей? Возьмите ${e.household}${altText}.`
}

/**
 * Упражнения, которые можно дать клиенту.
 * Инвентарь «none» доступен всегда; avoid клиента отсекает жёстко; прыжки — только если разрешены.
 * @param {HomeworkLibraryEntry[]} library
 * @param {{
 *   goal?: string,
 *   pattern?: string,
 *   phase?: string,
 *   maxLevel?: number,
 *   equipment?: string[],
 *   avoid?: string[],
 *   allowImpact?: boolean,
 * }} [opts]
 */
export function filterHomeworkLibrary(library, opts = {}) {
  const equipment = new Set(['none', ...(opts.equipment ?? HOMEWORK_DEFAULT_EQUIPMENT)])
  const avoid = new Set(opts.avoid ?? [])
  const maxLevel = opts.maxLevel ?? 3
  return (library ?? []).filter((e) => {
    if (opts.goal && !e.goals.includes(opts.goal)) return false
    if (opts.pattern && e.pattern !== opts.pattern) return false
    if (opts.phase && !homeworkEntryPhases(e).includes(opts.phase)) return false
    if (e.level > maxLevel) return false
    if (!equipment.has(e.equip)) return false
    if (e.impact && !opts.allowImpact) return false
    return !e.avoid.some((a) => avoid.has(a))
  })
}
