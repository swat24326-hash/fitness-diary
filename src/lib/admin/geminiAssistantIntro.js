/** Самопрезентация Василия / Василисы — универсальные шаблоны + подстановка филиала. */

import { periodLabelRu } from './geminiAnalyticsSnapshot.js'

export const GEMINI_INTRO_CHIP = {
  id: 'intro',
  label: 'Кто ты?',
  message: 'Кто ты и чем можешь помочь по нашему филиалу?',
  compare: false,
}

/** @typedef {'micro'|'standard'|'capabilities'|'sources'|'identity'|'deep'} GeminiIntroKind */

/**
 * @param {string} [clubName]
 * @returns {string}
 */
export function resolveGeminiClubLabel(clubName) {
  const name = String(clubName ?? '').trim()
  return name || 'филиал'
}

/**
 * @param {object} [snapshot]
 * @returns {{ planPct: number, reportsLabel: string, hasPlan: boolean, fitCity: number, reportCoveragePct: number } | null}
 */
export function kpiHintsFromSnapshot(snapshot) {
  if (!snapshot?.sales) return null
  const daysInMonth = Number(snapshot.period?.days_in_month) || 0
  const dayCount = Number(snapshot.sales.days_with_reports) || 0
  return {
    planPct: Number(snapshot.sales.plan_progress_pct) || 0,
    reportsLabel: daysInMonth > 0 ? `${dayCount}/${daysInMonth}` : String(dayCount),
    hasPlan: (Number(snapshot.sales.plan_total) || 0) > 0,
    fitCity: Number(snapshot.trainings?.fit_city_tablets_only) || 0,
    reportCoveragePct: Number(snapshot.sales.report_coverage_pct) || 0,
  }
}

function normalizeIntroText(text) {
  return String(text ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/ё/g, 'е')
}

/**
 * @param {string} userMessage
 * @returns {GeminiIntroKind|null}
 */
export function matchGeminiIntroIntent(userMessage) {
  const s = normalizeIntroText(userMessage)
  if (!s) return null

  if (normalizeIntroText(GEMINI_INTRO_CHIP.message) === s) return 'standard'

  if (/бот|нейросет|chatgpt|gemini|google|искусствен|нейронк|gpt/.test(s)) return 'identity'
  if (/откуда\s+циф|источник|откуда\s+бер|fit-?city|планшет|отчет\s+менедж|ручн(ой|ого)\s+отч/.test(s)) {
    return 'sources'
  }
  if (/подробн|как\s+счита|как\s+работа/.test(s) && /ты|васил|аналит|помога/.test(s)) return 'deep'
  if (/чем\s+пом|что\s+уме|что\s+мож|чем\s+полез|help/.test(s)) return 'capabilities'
  if (/кто\s+ты|ты\s+кто|представ|знаком|расскажи\s+о\s+себе|что\s+ты\s+за/.test(s)) return 'standard'

  return null
}

function personaName(gender) {
  return gender === 'female' ? 'Василиса' : 'Василий'
}

/**
 * @param {object} [opts]
 * @returns {{ name: string, club: string, period: string, clubPhrase: string }}
 */
function introContext(opts = {}) {
  const gender = opts.gender === 'female' ? 'female' : 'male'
  const name = personaName(gender)
  const club = resolveGeminiClubLabel(opts.clubName ?? opts.snapshot?.club_name)
  const hasClub = opts.hasClub !== false && club !== 'филиал'
  const period =
    String(opts.periodLabel ?? '').trim() ||
    periodLabelRu(opts.year, opts.month) ||
    'выбранный месяц'
  const clubPhrase = hasClub ? `«${club}»` : 'филиала'
  return { name, club, period, clubPhrase, hasClub }
}

function kpiTail(kpi) {
  if (!kpi) return ''
  const parts = []
  if (kpi.hasPlan) parts.push(`план ${kpi.planPct}%`)
  if (kpi.reportsLabel) parts.push(`отчётов ${kpi.reportsLabel}`)
  if (!parts.length) return ''
  return ` Сейчас по базе: ${parts.join(', ')}.`
}

function coverageNote(kpi) {
  if (!kpi || kpi.reportCoveragePct >= 30) return ''
  return ' Отчётов пока мало — буду осторожен с выводами.'
}

/**
 * @param {GeminiIntroKind} kind
 * @param {{
 *   clubName?: string,
 *   periodLabel?: string,
 *   year?: number,
 *   month?: number,
 *   gender?: string,
 *   hasClub?: boolean,
 *   kpi?: object | null,
 *   snapshot?: object | null,
 * }} opts
 * @returns {string}
 */
export function buildGeminiIntroReply(kind, opts = {}) {
  const kpi = opts.kpi ?? kpiHintsFromSnapshot(opts.snapshot) ?? null
  const ctx = introContext(opts)
  const tail = kpiTail(kpi)
  const coverage = coverageNote(kpi)

  switch (kind) {
    case 'micro':
      return buildMicroIntro(ctx, kpi, tail, coverage)
    case 'capabilities':
      return buildCapabilitiesIntro(ctx, tail)
    case 'sources':
      return buildSourcesIntro(ctx)
    case 'identity':
      return buildIdentityIntro(ctx)
    case 'deep':
      return buildDeepIntro(ctx, coverage)
    case 'standard':
    default:
      return buildStandardIntro(ctx, tail, coverage)
  }
}

function buildMicroIntro(ctx, kpi, tail, coverage) {
  const { name, clubPhrase, period, hasClub } = ctx

  if (!hasClub) {
    return `${name} на связи. Выбери филиал в шапке — тогда разберу его цифры за ${period}.`
  }

  if (kpi && !kpi.hasPlan && (kpi.reportCoveragePct || 0) < 15) {
    return `${name}, аналитик по ${clubPhrase}, ${period}. База ещё пустая — скажу, что есть, и где подтянуть отчёты.`
  }

  return `${name}, аналитик по ${clubPhrase}, ${period}. На связи — план, косяки, сравнение с прошлым месяцем.${tail}${coverage}`
}

function buildStandardIntro(ctx, tail, coverage) {
  const { name, clubPhrase, period, hasClub } = ctx

  if (!hasClub) {
    return `${name}, внутренний аналитик FIT-CITY. Работаю по одному филиалу за раз — выбери клуб в шапке, и разберём его цифры за ${period}. Не выдумываю данные: только отчёт менеджера и справка с планшетов.`
  }

  return (
    `${name}, твой аналитик по ${clubPhrase}, ${period}. ` +
    `Опираюсь на **отчёт менеджера** — прибыль, план и тренировки всего зала, и на **FIT-CITY** — только то, что тренеры записали с планшета; это не весь клуб, и так задумано. ` +
    `Могу: план продаж (уровни 1–3), ПНК, лучший день по прибыли, НК/ДК/УК, сравнение с прошлым месяцем, расхождение отчёт/планшеты, ЗП залов и маржа. Менеджера не заменяю, цифры не придумываю.${tail}${coverage} ` +
    `Жми кнопки снизу или спроси своими словами — на связи.`
  ).replace(/\*\*/g, '')
}

function buildCapabilitiesIntro(ctx, tail) {
  const { name, clubPhrase, hasClub } = ctx
  const scope = hasClub ? `по ${clubPhrase}` : 'по выбранному филиалу'

  return (
    `${name} ${scope}: ` +
    `план и выручка (уровни 1–3), ПНК, лучший день, НК/ДК/УК, главный косяк, динамика к прошлому месяцу, FIT-CITY vs отчёт менеджера, ЗП залов и чистая прибыль. ` +
    `Быстрые кнопки снизу — это готовые вопросы.${tail} Свободный текст тоже ок.`
  )
}

function buildSourcesIntro(ctx) {
  const { name, clubPhrase, hasClub } = ctx
  const who = hasClub ? `по ${clubPhrase}` : 'по филиалу'

  return (
    `${name}: цифры ${who} из двух мест. ` +
    `**Отчёт менеджера** — главный источник: прибыль НК/ДК/УК, ПНК, план (3 порога), матрица ПЗ/ТЗ/АЗ в штуках, тренировки всего зала и по типам карт. ` +
    `**FIT-CITY на планшетах** — справка: только завершённые тренировки тренеров с планшетом. ` +
    `Если в отчёте больше, чем в FIT-CITY — часто норма: часть зала без планшета. Не говорю «в системе должно совпадать».`
  ).replace(/\*\*/g, '')
}

function buildIdentityIntro(ctx) {
  const { name, clubPhrase, hasClub } = ctx
  const scope = hasClub ? ` по ${clubPhrase}` : ''

  return (
    `${name} — не внешний чат и не поисковик, а встроенный аналитик приложения FIT-CITY${scope}. ` +
    `Читаю только агрегаты клуба из ваших отчётов, без выдуманных цифр. Спрашивай про план и цифры — это моя зона.`
  )
}

function buildDeepIntro(ctx, coverage) {
  const { name, clubPhrase, period, hasClub } = ctx
  if (!hasClub) {
    return `${name}: после выбора филиала подтяну snapshot за ${period} — прибыль, plan_progress_pct, coverage отчётов, gap FIT-CITY vs менеджер. Пока клуб не выбран — данных нет.`
  }

  return (
    `${name}, как считаю для ${clubPhrase}, ${period}: ` +
    `план = profit_total / plan_level_3; achieved_plan_level = закрытый порог; coverage = дни с отчётом / дни месяца; gap = manager_report_total − fit_city_tablets_only; profit_day_highlights = лучший/худший день с отчётом. ` +
    `Сравнение с прошлым месяцем — только если ты явно просишь.${coverage} ` +
    `Всё это уже в JSON снимка — я не достраиваю от себя.`
  )
}

/** Короткое приветствие при открытии панели (клиент). */
export function buildGeminiMicroIntro(opts = {}) {
  return buildGeminiIntroReply('micro', opts)
}

/** Правило для system prompt — ответы «кто ты», не уходить в Gemini/Google. */
export function buildGeminiSelfPresentationRule() {
  return [
    'Если спрашивают кто ты, чем поможешь, откуда цифры, бот ли ты — представься как внутренний аналитик FIT-CITY (имя из persona), НЕ как Google/Gemini/ChatGPT.',
    'Называй филиал по club_name / current_period из JSON — для каждого клуба свой контекст, без вымышленных названий.',
    'Кратко: отчёт менеджера = истина по залу; FIT-CITY = только планшеты; не заменяешь менеджера; цифры не выдумываешь.',
    'На вопросы о себе не уходи в анализ месяца, пока явно не попросят цифры.',
  ].join(' ')
}
