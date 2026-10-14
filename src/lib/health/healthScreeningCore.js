/**
 * Анкета здоровья клиента (таблица health_screenings, одна строка на клиента): нормализация ответов,
 * итог для экрана и для подбора домашних заданий. Один модуль для планшета и сервера (cron авто-ДЗ).
 */
import { HOMEWORK_AVOID } from '../homework/library/homeworkLibraryTags.js'
import { isUuid, stableUuid } from '../stableUuid.js'
import { assertTrainerClientRowPush } from '../clientRowPushCore.js'
import {
  SCREEN_BONES,
  SCREEN_CLEARANCE,
  SCREEN_EQUIPMENT,
  SCREEN_LEVEL_BY_EXPERIENCE,
  SCREEN_LIFE,
  SCREEN_WOMEN,
  SCREEN_ZONE_DIAGNOSIS,
  SCREEN_ZONE_STATUS,
  SCREEN_ZONE_TRIGGERS,
  SCREEN_ZONES,
} from './healthScreeningCatalog.js'

export const healthScreeningRowId = (clientId) => stableUuid(`health_screening:${clientId}`)

const NOTE_MAX = 200
const has = (dict, key) => Object.hasOwn(dict, String(key))
const pickIds = (raw, dict) => [...new Set((Array.isArray(raw) ? raw : []).map(String).filter((x) => has(dict, x)))]
const cleanNote = (v) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, NOTE_MAX)

function normAnswer(raw, extra) {
  if (raw?.a === 'no') return { a: 'no' }
  if (raw?.a !== 'yes') return null
  const out = { a: 'yes', ...extra(raw) }
  const note = cleanNote(raw.note)
  if (note) out.note = note
  for (const k of Object.keys(out)) if (Array.isArray(out[k]) && !out[k].length) delete out[k]
  return out
}

function normGroup(raw, list, extra) {
  const out = {}
  for (const q of list) {
    const a = normAnswer(raw?.[q.id], (r) => extra(r, q))
    if (a) out[q.id] = a
  }
  return out
}

const questionExtra = (r, q) => ({ d: q.details ? pickIds(r.d, q.details) : [] })
const zoneExtra = (r) => ({
  ...(has(SCREEN_ZONE_STATUS, r.s) ? { s: String(r.s) } : {}),
  d: pickIds(r.d, SCREEN_ZONE_DIAGNOSIS),
  t: pickIds(r.t, SCREEN_ZONE_TRIGGERS),
})
const plainExtra = () => ({})

/** Ответы из формы / очереди → только известные ключи. Нет ответа ≠ «нет»: незаданный вопрос просто отсутствует. */
export function normalizeScreeningAnswers(raw) {
  const src = raw && typeof raw === 'object' ? raw : {}
  const life = {}
  for (const [key, q] of Object.entries(SCREEN_LIFE)) {
    const v = src.life?.[key]
    if (v != null && has(q.options, v)) life[key] = String(v)
  }
  if (Array.isArray(src.life?.equipment)) life.equipment = pickIds(src.life.equipment, SCREEN_EQUIPMENT)
  const c = src.cleared
  const clearedAt = Date.parse(String(c?.at ?? ''))
  const cleared =
    c && typeof c.key === 'string' && isUuid(c.by) && Number.isFinite(clearedAt)
      ? { key: c.key.slice(0, 500), by: String(c.by), at: new Date(clearedAt).toISOString() }
      : null
  return {
    v: 1,
    clearance: normGroup(src.clearance, SCREEN_CLEARANCE, questionExtra),
    zones: normGroup(src.zones, SCREEN_ZONES, zoneExtra),
    bones: normGroup(src.bones, SCREEN_BONES, plainExtra),
    women: normGroup(src.women, SCREEN_WOMEN, plainExtra),
    life,
    ...(cleared ? { cleared } : {}),
  }
}

/**
 * Строка очереди → колонки health_screenings.
 * @returns {{ ok: true, data: object } | { ok: false, error: string }}
 */
export function normalizeHealthScreeningRow(row) {
  if (!isUuid(row?.id) || !isUuid(row?.client_id) || !isUuid(row?.updated_by)) return { ok: false, error: 'Некорректная анкета здоровья' }
  if (String(row.id) !== healthScreeningRowId(row.client_id)) return { ok: false, error: 'Некорректная анкета здоровья' }
  const updatedMs = Date.parse(String(row?.updated_at ?? ''))
  return {
    ok: true,
    data: {
      id: String(row.id),
      client_id: String(row.client_id),
      club_id: isUuid(row?.club_id) ? String(row.club_id) : null,
      answers: normalizeScreeningAnswers(row.answers),
      updated_by: String(row.updated_by),
      updated_at: Number.isFinite(updatedMs) ? new Date(updatedMs).toISOString() : new Date().toISOString(),
    },
  }
}

export function assertHealthScreeningPush(p) {
  return assertTrainerClientRowPush({
    ...p,
    rowId: healthScreeningRowId,
    what: { noDelete: 'Анкета здоровья не удаляется', who: 'Анкету заполняет тренер клиента', bad: 'Некорректная анкета здоровья' },
  })
}

const labelsOf = (ids, dict) => (ids ?? []).map((id) => (typeof dict[id] === 'string' ? dict[id] : dict[id]?.label)).filter(Boolean)
const showWomen = (sex) => sex === 'female'

/**
 * Итог анкеты. Пол влияет только на то, показывать ли блок «Женское здоровье»; отвеченное «да» учитывается всегда —
 * иначе подтверждение допуска на планшете и проверка на сервере разошлись бы при разном поле в карточке и в авто-ДЗ.
 * flags — что требует подтверждения тренера (блок «Допуск», болит сейчас, беременность);
 * badges — короткие метки для карточки и экрана тренировки (danger — допуск, warning — учесть).
 */
export function screeningSummary(rawAnswers) {
  const a = normalizeScreeningAnswers(rawAnswers)
  const avoid = new Set()
  const flags = []
  const badges = []
  let noImpact = false
  const addAvoid = (list) => (list ?? []).forEach((x) => has(HOMEWORK_AVOID, x) && avoid.add(x))

  for (const q of SCREEN_CLEARANCE) {
    const ans = a.clearance[q.id]
    if (ans?.a !== 'yes') continue
    flags.push(q.id)
    addAvoid(q.avoid)
    for (const d of ans.d ?? []) addAvoid(q.avoidIf?.[d])
    if (q.noImpact) noImpact = true
    const det = labelsOf(ans.d, q.details ?? {})
    badges.push({ id: q.id, tone: 'danger', text: det.length ? `${q.label}: ${det.join(', ').toLowerCase()}` : q.label })
  }

  for (const z of SCREEN_ZONES) {
    const ans = a.zones[z.id]
    if (ans?.a !== 'yes') continue
    const acute = ans.s === 'now'
    if (acute) flags.push(`zone:${z.id}`)
    if (ans.s !== 'past' || ans.d?.length) addAvoid(z.avoid)
    for (const t of ans.t ?? []) {
      addAvoid(SCREEN_ZONE_TRIGGERS[t].avoid)
      if (SCREEN_ZONE_TRIGGERS[t].noImpact) noImpact = true
    }
    const dx = labelsOf(ans.d, SCREEN_ZONE_DIAGNOSIS)
    const parts = [z.label, dx.join(', ').toLowerCase(), ans.s ? SCREEN_ZONE_STATUS[ans.s].toLowerCase() : ''].filter(Boolean)
    badges.push({ id: `zone:${z.id}`, tone: acute ? 'danger' : 'warning', text: parts.join(' · ') })
  }

  for (const q of SCREEN_BONES) {
    if (a.bones[q.id]?.a !== 'yes') continue
    addAvoid(q.avoid)
    if (q.noImpact) noImpact = true
    badges.push({ id: q.id, tone: 'warning', text: q.label })
  }

  for (const q of SCREEN_WOMEN) {
    if (a.women[q.id]?.a !== 'yes') continue
    if (q.noImpact) noImpact = true
    if (q.needsTrainer) flags.push(q.id)
    badges.push({ id: q.id, tone: q.needsTrainer ? 'danger' : 'warning', text: q.label })
  }

  const life = a.life
  const flagsKey = [...flags].sort().join(',')
  const answered =
    [a.clearance, a.zones, a.bones, a.women].some((g) => Object.keys(g).length) || Object.keys(life).length > 0
  return {
    answered,
    flags,
    flagsKey,
    needsClearance: flags.length > 0 && a.cleared?.key !== flagsKey,
    cleared: flags.length > 0 && a.cleared?.key === flagsKey,
    gentle: flags.length > 0,
    pulseUnreliable: a.clearance.heart?.a === 'yes' || Boolean(a.clearance.meds?.d?.includes('pulse')),
    avoid: [...avoid],
    noImpact,
    level: SCREEN_LEVEL_BY_EXPERIENCE[life.experience] ?? null,
    sessions: life.home_days ? (Number(life.home_days) >= 3 ? 3 : 2) : null,
    equipment: life.equipment ? ['none', ...life.equipment.filter((e) => e !== 'mat')] : null,
    badges,
  }
}

/** Сколько вопросов блока отвечено — для «3 из 14» на экране. */
export function screeningProgress(rawAnswers, sex = null) {
  const a = normalizeScreeningAnswers(rawAnswers)
  const count = (g, list) => ({ done: list.filter((q) => g[q.id]).length, total: list.length })
  return {
    clearance: count(a.clearance, SCREEN_CLEARANCE),
    zones: count({ ...a.zones, ...a.bones }, [...SCREEN_ZONES, ...SCREEN_BONES]),
    women: showWomen(sex) ? count(a.women, SCREEN_WOMEN) : null,
    life: { done: Object.keys(a.life).length, total: Object.keys(SCREEN_LIFE).length + 1 },
  }
}

/** Тренер подтвердил допуск при текущем наборе флагов; новый флаг — подтверждать заново. */
export function screeningWithClearance(rawAnswers, userId, now = new Date()) {
  const a = normalizeScreeningAnswers(rawAnswers)
  return { ...a, cleared: { key: screeningSummary(a).flagsKey, by: String(userId), at: now.toISOString() } }
}

/** «Всё нет» для блока: отвеченное «да» не трогаем, незаполненное → «нет». */
export function screeningBlockAllNo(rawAnswers, block) {
  const a = normalizeScreeningAnswers(rawAnswers)
  const lists = { clearance: [SCREEN_CLEARANCE], zones: [SCREEN_ZONES, SCREEN_BONES], women: [SCREEN_WOMEN] }[block] ?? []
  const groups = block === 'zones' ? ['zones', 'bones'] : [block]
  const next = { ...a }
  lists.forEach((list, i) => {
    const g = { ...next[groups[i]] }
    for (const q of list) if (!g[q.id]) g[q.id] = { a: 'no' }
    next[groups[i]] = g
  })
  return next
}

/** «Для ДЗ: без упражнений на колени, поясницу · без прыжков · новичок · 2 занятия · дома: резинка» */
export function screeningHomeworkLine(summary) {
  if (!summary?.answered) return ''
  const parts = []
  if (summary.avoid.length) parts.push(`беречь: ${summary.avoid.map((a) => HOMEWORK_AVOID[a].toLowerCase()).join(', ')}`)
  if (summary.noImpact) parts.push('без прыжков')
  if (summary.gentle) parts.push('щадящая нагрузка')
  else if (summary.level) parts.push(`уровень ${summary.level} из 3`)
  if (summary.sessions) parts.push(`${summary.sessions} занятия в неделю`)
  if (summary.equipment) {
    const eq = summary.equipment.filter((e) => e !== 'none').map((e) => SCREEN_EQUIPMENT[e].toLowerCase())
    parts.push(eq.length ? `дома: ${eq.join(', ')}` : 'дома без инвентаря')
  }
  return parts.length ? `Для домашних заданий: ${parts.join(' · ')}` : ''
}

/** Анкету начали заполнять — дальше решает она, а не свободный текст карточки. */
export function screeningAnswered(rawAnswers) {
  return rawAnswers ? screeningSummary(rawAnswers).answered : false
}

/** Нужно подтверждение тренера, прежде чем ДЗ уйдёт само. */
export function screeningNeedsClearance(rawAnswers) {
  return rawAnswers ? screeningSummary(rawAnswers).needsClearance : false
}

/**
 * Что анкета добавляет к настройкам авто-ДЗ: ограничения складываются с выбранными тренером,
 * при флагах допуска — уровень «новичок» (щадящая нагрузка).
 */
export function screeningHomeworkInputs(row, rawAnswers) {
  const base = { level: row.level, avoid: row.avoid ?? [], noImpact: false, equipment: undefined }
  if (!rawAnswers) return base
  const s = screeningSummary(rawAnswers)
  if (!s.answered) return base
  return {
    level: s.gentle ? 1 : row.level,
    avoid: [...new Set([...(row.avoid ?? []), ...s.avoid])],
    noImpact: s.noImpact,
    equipment: s.equipment ?? undefined,
  }
}
