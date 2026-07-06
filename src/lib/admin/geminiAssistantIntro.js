/** Самопрезентация ЭВС «ИСКРА» — два контура, без выдуманных цифр. */

import { ISKRA_FULL_NAME, ISKRA_NAME } from './geminiIskraCore.js'
import { periodLabelRu } from './geminiAnalyticsSnapshot.js'

export const GEMINI_INTRO_CHIP = {
  id: 'intro',
  label: 'Кто ты?',
  message: 'Кто ты и чем можешь помочь по нашему филиалу?',
  compare: false,
}

/** @typedef {'micro'|'standard'|'capabilities'|'sources'|'identity'|'deep'} GeminiIntroKind */

export function resolveGeminiClubLabel(clubName) {
  const name = String(clubName ?? '').trim()
  return name || 'филиал'
}

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

export function matchGeminiIntroIntent(userMessage) {
  const s = normalizeIntroText(userMessage)
  if (!s) return null

  if (normalizeIntroText(GEMINI_INTRO_CHIP.message) === s) return 'standard'

  if (/бот|нейросет|chatgpt|gemini|google|искусствен|нейронк|gpt/.test(s)) return 'identity'
  if (/откуда\s+циф|источник|откуда\s+бер|fit-?city|планшет|отчет\s+менедж|ручн(ой|ого)\s+отч|контур/.test(s)) {
    return 'sources'
  }
  if (/подробн|как\s+счита|как\s+работа/.test(s) && /ты|искр|аналит|помога/.test(s)) return 'deep'
  if (/чем\s+пом|что\s+уме|что\s+мож|чем\s+полез|help/.test(s)) return 'capabilities'
  if (/кто\s+ты|ты\s+кто|представ|знаком|расскажи\s+о\s+себе|что\s+ты\s+за|искр/.test(s)) return 'standard'

  return null
}

function introContext(opts = {}) {
  const club = resolveGeminiClubLabel(opts.clubName ?? opts.snapshot?.club_name)
  const hasClub = opts.hasClub !== false && club !== 'филиал'
  const period =
    String(opts.periodLabel ?? '').trim() ||
    periodLabelRu(opts.year, opts.month) ||
    'выбранный месяц'
  const clubPhrase = hasClub ? `«${club}»` : 'филиала'
  return { name: ISKRA_NAME, fullName: ISKRA_FULL_NAME, club, period, clubPhrase, hasClub }
}

function kpiTail(kpi) {
  if (!kpi) return ''
  const parts = []
  if (kpi.hasPlan) parts.push(`план ${kpi.planPct}%`)
  if (kpi.reportsLabel) parts.push(`отчётов ${kpi.reportsLabel}`)
  if (!parts.length) return ''
  return ` По базе: ${parts.join(', ')}.`
}

function coverageNote(kpi) {
  if (!kpi || kpi.reportCoveragePct >= 30) return ''
  return ' Отчётов мало — выводы предварительные.'
}

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
  const { name, fullName, clubPhrase, period, hasClub } = ctx

  if (!hasClub) {
    return `${fullName} на связи. Выберите филиал в шапке — подготовлю аналитику за ${period}.`
  }

  if (kpi && !kpi.hasPlan && (kpi.reportCoveragePct || 0) < 15) {
    return `${name}, модуль аналитики по ${clubPhrase}, ${period}. База ещё не заполнена — покажу доступные данные и зоны риска.${coverage}`
  }

  return `${name}, ${fullName} по ${clubPhrase}, ${period}. Готова разобрать план продаж, финансы клуба и тренерский контур.${tail}${coverage}`
}

function buildStandardIntro(ctx, tail, coverage) {
  const { name, fullName, clubPhrase, period, hasClub } = ctx

  if (!hasClub) {
    return `${fullName} — внутренний аналитический модуль FIT-CITY. Работаю по одному филиалу: выберите клуб в шапке. Цифры не вычисляю сама — только готовые поля из отчётов и синхронизации планшетов.`
  }

  return (
    `${name}, ${fullName} по ${clubPhrase}, ${period}. ` +
    `Два контура: sales_contour — отчёт менеджера (план, прибыль, ЗП залов из матрицы); trainer_contour — планшеты (завершённые тренировки, личная ЗП тренера, активные и неактивные клиенты). ` +
    `Контуры не смешиваю. Могу: план и уровни, ПНК, лучший день, сравнение с прошлым месяцем, расхождение отчёт/FIT-CITY, маржа клуба, сводку по тренерам.${tail}${coverage} ` +
    `Задайте вопрос текстом или кнопкой ниже.`
  )
}

function buildCapabilitiesIntro(ctx, tail) {
  const { name, clubPhrase, hasClub } = ctx
  const scope = hasClub ? `по ${clubPhrase}` : 'по выбранному филиалу'

  return (
    `${name} ${scope}: план продаж, ПНК, лучший день по прибыли, структура НК/ДК/УК, риски месяца, динамика к прошлому месяцу, ` +
    `FIT-CITY против отчёта менеджера, чистая прибыль и ЗП залов, неактивные клиенты тренеров, личная ЗП тренера.${tail} ` +
    `Быстрые кнопки — готовые запросы.`
  )
}

function buildSourcesIntro(ctx) {
  const { name, clubPhrase, hasClub } = ctx
  const who = hasClub ? `по ${clubPhrase}` : 'по филиалу'

  return (
    `${name}: данные ${who} из двух изолированных контуров. ` +
    `Контур продаж — ежедневный отчёт менеджера: прибыль, план (возвраты не уменьшают план), матрица ПЗ/ТЗ/АЗ, ЗП залов для финансовой картины. ` +
    `Контур тренеров — планшеты FIT-CITY: завершённые тренировки, personal_salary_month, активные и неактивные закреплённые клиенты. ` +
    `finance.trainer_payroll и сумма personal_salary_month — разные алгоритмы; расхождение возможно.`
  )
}

function buildIdentityIntro(ctx) {
  const { fullName, clubPhrase, hasClub } = ctx
  const scope = hasClub ? ` по ${clubPhrase}` : ''

  return (
    `${fullName} — не внешний чат и не поисковик, а встроенный модуль аналитики FIT-CITY${scope}. ` +
    `Читаю только агрегаты из JSON-снимка. Сама не считаю — интерпретирую готовые поля системы.`
  )
}

function buildDeepIntro(ctx, coverage) {
  const { name, clubPhrase, period, hasClub } = ctx
  if (!hasClub) {
    return `${name}: после выбора филиала подтяну snapshot за ${period} — plan_progress_pct, coverage, gap FIT-CITY, trainer_contour.club_roll_up. Пока клуб не выбран — данных нет.`
  }

  return (
    `${name}, логика для ${clubPhrase}, ${period}: ` +
    `план = plan_fact_gross / plan_level_3 (валовая, без вычета возвратов); profit_total — после возвратов; ` +
    `trainer_contour.personal_salary_month — только завершённые × ставка типа карты; «Без типа» исключены; ` +
    `finance.trainer_payroll — из матрицы продаж, не сумма личных ЗП.${coverage} Все поля уже в JSON — не достраиваю от себя.`
  )
}

export function buildGeminiMicroIntro(opts = {}) {
  return buildGeminiIntroReply('micro', opts)
}

export function buildGeminiSelfPresentationRule() {
  return [
    'Если спрашивают кто ты — представься как ЭВС «ИСКРА», внутренний модуль FIT-CITY, НЕ Google/Gemini/ChatGPT.',
    'Два контура: sales_contour и trainer_contour — не смешивай в одном ответе без явного сравнения.',
    'Цифры только из JSON; сама не считаешь.',
  ].join(' ')
}
