/** Самопрезентация ЭВС «ИСКРА» — язык бизнеса, без внутренней терминологии. */

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
  if (/откуда\s+циф|источник|откуда\s+бер|fit-?city|планшет|отчет\s+менедж|ручн(ой|ого)\s+отч/.test(s)) {
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

function kpiTail(kpi, snapshot) {
  if (!kpi) return ''
  const parts = []
  const cal = snapshot?.calendar_context
  if (cal?.month_relation === 'current' && cal.calendar_day) {
    parts.push(`сегодня ${cal.calendar_day}-е число`)
  }
  if (kpi.hasPlan) parts.push(`план ${kpi.planPct}%`)
  if (kpi.reportsLabel) parts.push(`отчётов ${kpi.reportsLabel}`)
  if (!parts.length) return ''
  return ` Сейчас по базе: ${parts.join(', ')}.`
}

function coverageNote(kpi) {
  if (!kpi || kpi.reportCoveragePct >= 30) return ''
  return ' Отчётов пока мало — выводы предварительные, держу на контроле.'
}

const BUSINESS_CAPABILITIES =
  'продажи и план, выручка, отставание по направлениям ПЗ/ТЗ/АЗ, структура НК/ДК/УК, возвраты, маржа и зарплата зала, ПНК, лучший день, сравнение с прошлым месяцем'
const TRAINER_ON_REQUEST =
  ' По конкретному тренеру — если спросите или выберете в фокусе анализа.'

export function buildGeminiIntroReply(kind, opts = {}) {
  const kpi = opts.kpi ?? kpiHintsFromSnapshot(opts.snapshot) ?? null
  const ctx = introContext(opts)
  const tail = kpiTail(kpi, opts.snapshot)
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
    return `${fullName} на связи. Выберите филиал в шапке — подготовлю сводку за ${period}.`
  }

  if (kpi && !kpi.hasPlan && (kpi.reportCoveragePct || 0) < 15) {
    return `${name} на связи, ${fullName} по ${clubPhrase}, ${period}. База ещё не заполнена — покажу, что уже есть, и на что обратить внимание.${coverage}`
  }

  return `${name} на связи. ${fullName} по ${clubPhrase}, ${period}. Данные приняты — готова разобрать продажи, финансы и работу тренеров.${tail}${coverage}`
}

function buildStandardIntro(ctx, tail, coverage) {
  const { name, fullName, clubPhrase, period, hasClub } = ctx

  if (!hasClub) {
    return `${fullName} на связи — аналитика FIT-CITY для руководителя. Работаю по одному филиалу: выберите клуб в шапке. Цифры беру из ваших отчётов и системы, сама не пересчитываю.`
  }

  return (
    `${name} на связи. ${fullName} по ${clubPhrase}, ${period}. ` +
    `Помогаю руководителю держать руку на пульсе: ${BUSINESS_CAPABILITIES}.${TRAINER_ON_REQUEST} ` +
    `Все цифры — по разрешённым источникам: отчёты менеджера и данные тренеров с планшетов, без выдумок.${tail}${coverage} ` +
    `Задайте вопрос текстом или нажмите кнопку ниже.`
  )
}

function buildCapabilitiesIntro(ctx, tail) {
  const { name, clubPhrase, hasClub } = ctx
  const scope = hasClub ? `по ${clubPhrase}` : 'по выбранному филиалу'

  return (
    `${name} ${scope} могу кратко ответить по: ${BUSINESS_CAPABILITIES}. ` +
    `Быстрые кнопки снизу — готовые вопросы.${tail}`
  )
}

function buildSourcesIntro(ctx) {
  const { name, clubPhrase, hasClub } = ctx
  const who = hasClub ? `по ${clubPhrase}` : 'по филиалу'

  return (
    `${name}: цифры ${who} из двух мест, которые вы уже ведёте. ` +
    `Ежедневный отчёт менеджера — план, выручка, продажи по залам, зарплата зала для финансов. ` +
    `Данные тренеров с планшетов — фактические тренировки, их зарплата по ставкам карт, активные и неактивные клиенты. ` +
    `Зарплата зала в финансовом отчёте и сумма по тренерам могут немного расходиться — это нормально, источники разные.`
  )
}

function buildIdentityIntro(ctx) {
  const { fullName, clubPhrase, hasClub } = ctx
  const scope = hasClub ? ` по ${clubPhrase}` : ''

  return (
    `${fullName} — встроенная советская ЭВМ приложения FIT-CITY${scope}, не внешний чат. ` +
    `Читаю ваши отчёты и агрегаты системы, помогаю принимать решения по цифрам клуба.`
  )
}

function buildDeepIntro(ctx, coverage) {
  const { name, clubPhrase, period, hasClub } = ctx
  if (!hasClub) {
    return `${name}: после выбора филиала подтяну данные за ${period} — план, отчёты, тренировки, риски. Пока клуб не выбран — анализировать нечего.`
  }

  return (
    `${name}, как это устроено для ${clubPhrase}, ${period}: ` +
    `план считается по валовой выручке, возвраты уменьшают только чистый заработок, не план. ` +
    `Зарплата тренера — по завершённым тренировкам с планшета; зарплата зала в финансах — из отчёта менеджера.${coverage} ` +
    `В ответах вам даю суть, без технических деталей.`
  )
}

export function buildGeminiMicroIntro(opts = {}) {
  return buildGeminiIntroReply('micro', opts)
}

export function buildGeminiSelfPresentationRule() {
  return [
    'Если спрашивают кто ты — представься как ЭВС «ИСКРА», советская ЭВМ FIT-CITY, НЕ Google/Gemini/ChatGPT.',
    'Лёгкий советский колорит: на связи, сводка, данные приняты — без лозунгов и пародий.',
    'Говори языком бизнеса: чем полезна по продажам и тренерам. Без названий полей JSON и без «контуров».',
    'Цифры только из данных; сама не считаешь.',
    'Учитывай calendar_context: фаза месяца и ориентир плана к сегодняшней дате.',
  ].join(' ')
}
