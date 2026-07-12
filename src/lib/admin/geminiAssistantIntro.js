/** Самопрезентация ЭВС «ИСКРА» — язык бизнеса, без внутренней терминологии. */

import { ISKRA_FULL_NAME, ISKRA_NAME } from './geminiIskraCore.js'
import { periodLabelRu } from './geminiAnalyticsSnapshot.js'
import { phrasePlanProgress } from './iskraReplyPhrasing.js'
import { buildIskraBusinessHighlights, buildIskraIntroPitch } from './iskraBusinessHighlights.js'
import { isTrainerFocusedQuestion } from './iskraTrainerRouting.js'

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
    reportDays: dayCount,
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
  if (isTrainerFocusedQuestion(userMessage)) return null

  const s = normalizeIntroText(userMessage)
  if (!s) return null

  if (normalizeIntroText(GEMINI_INTRO_CHIP.message) === s) return 'standard'

  if (/бот|нейросет|chatgpt|gemini|google|искусствен|нейронк|gpt/.test(s)) return 'identity'
  if (/откуда\s+циф|источник|откуда\s+бер|fit-?city|планшет|отчет\s+менедж|ручн(ой|ого)\s+отч/.test(s)) {
    return 'sources'
  }
  if (/подробн|как\s+счита|как\s+работа/.test(s) && /ты|искр|аналит|помога/.test(s)) return 'deep'
  if (/чем\s+пом|что\s+уме|что\s+мож|чем\s+полез|help/.test(s)) return 'capabilities'
  if (/кто\s+ты|ты\s+кто|представ|знаком|расскажи\s+о\s+себе|что\s+ты\s+за/.test(s)) return 'standard'
  if (/^искра[!?.,\s]*$/.test(s) || /^эвс[!?.,\s]*$/.test(s)) return 'standard'

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
  const highlights = buildIskraBusinessHighlights(snapshot)
  if (highlights) return ` ${highlights}.`

  if (!kpi) return ''
  const parts = []
  const cal = snapshot?.calendar_context
  if (cal?.month_relation === 'current' && cal.calendar_day) {
    parts.push(`сегодня ${cal.calendar_day}-е число`)
  }
  if (kpi.hasPlan) parts.push(phrasePlanProgress(kpi.planPct))
  if (!parts.length) return ''
  return ` Сейчас: ${parts.join(', ')}.`
}

function missingReportNote(kpi, snapshot) {
  const cal = snapshot?.calendar_context
  if (cal?.month_relation !== 'current') return ''
  const days = Number(kpi?.reportDays) || 0
  if (days > 0) return ''
  return ' Отчёт за сегодня ещё не внесён — сводка по вчерашним данным.'
}

const TRAINER_ON_REQUEST = ' Тренер — по запросу.'

export function buildGeminiIntroReply(kind, opts = {}) {
  const kpi = opts.kpi ?? kpiHintsFromSnapshot(opts.snapshot) ?? null
  const ctx = introContext(opts)
  const tail = kpiTail(kpi, opts.snapshot)
  const missingReport = missingReportNote(kpi, opts.snapshot)
  const pitch = buildIskraIntroPitch(opts.snapshot)

  switch (kind) {
    case 'micro':
      return buildMicroIntro(ctx, kpi, tail, missingReport, pitch)
    case 'capabilities':
      return buildCapabilitiesIntro(ctx, pitch)
    case 'sources':
      return buildSourcesIntro(ctx)
    case 'identity':
      return buildIdentityIntro(ctx)
    case 'deep':
      return buildDeepIntro(ctx, missingReport)
    case 'standard':
    default:
      return buildStandardIntro(ctx, tail, missingReport, pitch)
  }
}

function buildMicroIntro(ctx, kpi, _tail, missingReport, pitch) {
  const { name, clubPhrase, period, hasClub } = ctx

  if (!hasClub) {
    return `${name} на связи. Выберите филиал — дам план и прибыль за ${period}.`
  }

  if (kpi && !kpi.hasPlan && (kpi.reportDays || 0) === 0) {
    return `${name}, ${clubPhrase}, ${period}. Данных мало.${missingReport} На связи.`
  }

  return `${name}, ${clubPhrase}, ${period}. ${pitch}${missingReport} На связи.`
}

function buildStandardIntro(ctx, tail, missingReport, pitch) {
  const { name, clubPhrase, period, hasClub } = ctx

  if (!hasClub) {
    return `${name} на связи. Выберите филиал в шапке — план, прогноз, прибыль.`
  }

  const pitchHasNow = String(pitch).includes('Сейчас:')
  const kpiSuffix = pitchHasNow ? '' : tail

  return (
    `${name}, ${clubPhrase}, ${period}. ${pitch}${kpiSuffix}${missingReport} ` +
    `Спросите или нажмите кнопку.${TRAINER_ON_REQUEST} На связи.`
  )
}

function buildCapabilitiesIntro(ctx, pitch) {
  const { name, clubPhrase, hasClub } = ctx
  const scope = hasClub ? clubPhrase : 'филиал'

  return `${name}, ${scope}: ${pitch} Кнопки снизу — готовые вопросы.`
}

function buildSourcesIntro(ctx) {
  const { name, clubPhrase, hasClub } = ctx
  const who = hasClub ? clubPhrase : 'филиал'

  return (
    `${name}: цифры ${who} из отчётов менеджера и «Финансы клуба». ` +
    `Тренеры с планшетов — по запросу.`
  )
}

function buildIdentityIntro(ctx) {
  const { name, clubPhrase, hasClub } = ctx
  const scope = hasClub ? `, ${clubPhrase}` : ''

  return `${name} — ЭВМ FIT-CITY${scope}, не внешний чат. План, прогноз, прибыль из ваших отчётов.`
}

function buildDeepIntro(ctx, missingReport) {
  const { name, clubPhrase, period, hasClub } = ctx
  if (!hasClub) {
    return `${name}: выберите филиал — план и финансы за ${period}.`
  }

  return (
    `${name}, ${clubPhrase}, ${period}: план по валу, возвраты в чистую прибыль, ` +
    `прогноз как «Финансы клуба». Оценки модели — с пометкой «Оценка ИСКРЫ».${missingReport}`
  )
}

export function buildGeminiMicroIntro(opts = {}) {
  return buildGeminiIntroReply('micro', opts)
}

export function buildGeminiSelfPresentationRule() {
  return [
    'Если спрашивают кто ты — представься как ЭВС «ИСКРА», советская ЭВМ FIT-CITY, НЕ Google/Gemini/ChatGPT.',
    'Продавай пользу: план, прогноз, чистая прибыль, отставание по залам — не перечисление функций.',
    'Можешь связывать данные и отвечать на открытые вопросы; свои выводы — с пометкой «Оценка ИСКРЫ».',
    'Не акцентируй число отчётов и расхождение менеджер/планшеты.',
    'Учитывай calendar_context и club_finance (прогноз как вкладка «Финансы клуба»).',
  ].join(' ')
}
