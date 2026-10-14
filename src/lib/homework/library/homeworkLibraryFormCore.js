/**
 * Форма упражнения библиотеки ДЗ в админке: поля ↔ запись библиотеки, ошибки по-русски у каждого поля.
 * Правила те же, что validateHomeworkLibraryEntry (генератор и сервер проверяют ими же).
 */
import { homeworkEntryPhases } from './homeworkLibrary.js'
import { homeworkLibraryAltOptions } from './homeworkLibraryOverridesCore.js'

export const HOMEWORK_FORM_LIMITS = { name: 120, household: 80, how: 220, cue: 100 }

export function emptyHomeworkLibraryForm(id) {
  return {
    id,
    name: '',
    pattern: 'squat',
    level: 1,
    equip: 'none',
    household: '',
    alt: '',
    unit: 'reps',
    phases: ['main'],
    side: false,
    impact: false,
    avoid: [],
    goals: [],
    focus: 'lower',
    how: '',
    cue: '',
  }
}

export function homeworkLibraryFormFromEntry(entry) {
  return {
    ...emptyHomeworkLibraryForm(entry.id),
    ...entry,
    household: entry.household ?? '',
    alt: entry.alt ?? '',
    side: Boolean(entry.side),
    impact: Boolean(entry.impact),
    avoid: [...(entry.avoid ?? [])],
    goals: [...(entry.goals ?? [])],
    phases: [...homeworkEntryPhases(entry)],
  }
}

/** Запись библиотеки: замена гантелей — только у гантелей; части занятия — только если не совпадают с правилом. */
export function homeworkEntryFromForm(form) {
  const dumbbells = form.equip === 'dumbbells'
  const entry = {
    id: form.id,
    name: String(form.name ?? '').trim(),
    pattern: form.pattern,
    level: Number(form.level),
    equip: form.equip,
    ...(dumbbells ? { household: String(form.household ?? '').trim(), alt: form.alt || undefined } : {}),
    unit: form.unit,
    ...(form.side ? { side: true } : {}),
    ...(form.impact ? { impact: true } : {}),
    avoid: [...form.avoid],
    goals: [...form.goals],
    focus: form.focus,
    how: String(form.how ?? '').trim(),
    cue: String(form.cue ?? '').trim(),
  }
  const byRule = homeworkEntryPhases({ ...entry, phases: undefined })
  const same = form.phases.length === byRule.length && byRule.every((p) => form.phases.includes(p))
  if (!same) entry.phases = [...form.phases]
  return entry
}

/** @returns {Record<string, string>} поле → текст ошибки; пусто — можно сохранять */
export function homeworkLibraryFormErrors(form, library) {
  const e = {}
  const len = (v) => String(v ?? '').trim().length
  if (!len(form.name)) e.name = 'Введите название'
  else if (len(form.name) > HOMEWORK_FORM_LIMITS.name) e.name = `Не длиннее ${HOMEWORK_FORM_LIMITS.name} символов`
  if (!form.goals.length) e.goals = 'Выберите хотя бы одну цель'
  if (!form.phases.length) e.phases = 'Выберите хотя бы одну часть занятия'
  if (!len(form.how)) e.how = 'Опишите, как выполнять'
  else if (len(form.how) > HOMEWORK_FORM_LIMITS.how) e.how = `Не длиннее ${HOMEWORK_FORM_LIMITS.how} символов`
  if (!len(form.cue)) e.cue = 'Напишите главную ошибку техники'
  else if (len(form.cue) > HOMEWORK_FORM_LIMITS.cue) e.cue = `Не длиннее ${HOMEWORK_FORM_LIMITS.cue} символов`
  if (form.impact && Number(form.level) < 2) e.impact = 'Прыжки — только для уровня «Средний» и выше'
  else if (form.impact && !form.avoid.includes('knees')) e.impact = 'С прыжками отметьте ограничение «Колени»'
  if (form.equip === 'dumbbells') {
    if (!len(form.household)) e.household = 'Чем заменить гантели дома (например, «бутылки с водой»)'
    else if (len(form.household) > HOMEWORK_FORM_LIMITS.household) e.household = `Не длиннее ${HOMEWORK_FORM_LIMITS.household} символов`
    const alts = homeworkLibraryAltOptions(library, form.pattern, form.avoid).filter((x) => x.id !== form.id)
    if (!form.alt) e.alt = 'Выберите упражнение без гантелей на замену'
    else if (!alts.some((x) => x.id === form.alt)) e.alt = 'Замена: то же движение, без гантелей и без новых ограничений'
  }
  return e
}
