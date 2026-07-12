/** Самопрезентация ЭВС «ИСКРА» — язык бизнеса, без внутренней терминологии. */

import { ISKRA_FULL_NAME, ISKRA_NAME } from './geminiIskraCore.js'
import { periodLabelRu } from './geminiAnalyticsSnapshot.js'
import {
  buildIskraIntroAdPitch,
  introAdSeed,
} from './iskraBusinessHighlights.js'
import { joinIskraReply, iskraReplyHeader } from './iskraReplyCompact.js'
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

function missingReportNote(kpi, snapshot) {
  const cal = snapshot?.calendar_context
  if (cal?.month_relation !== 'current') return ''
  const days = Number(kpi?.reportDays) || 0
  if (days > 0) return ''
  return ' Отчёт за сегодня ещё не внесён.'
}

export function buildGeminiIntroReply(kind, opts = {}) {
  const kpi = opts.kpi ?? kpiHintsFromSnapshot(opts.snapshot) ?? null
  const ctx = introContext(opts)
  const missingReport = missingReportNote(kpi, opts.snapshot)
  const adPitch = buildIskraIntroAdPitch(introAdSeed(ctx.club, ctx.period))

  switch (kind) {
    case 'micro':
      return buildMicroIntro(ctx, kpi, missingReport, adPitch)
    case 'capabilities':
      return buildCapabilitiesIntro(ctx, adPitch)
    case 'sources':
      return buildSourcesIntro(ctx)
    case 'identity':
      return buildIdentityIntro(ctx)
    case 'deep':
      return buildDeepIntro(ctx, missingReport)
    case 'standard':
    default:
      return buildStandardIntro(ctx, missingReport, adPitch)
  }
}

function buildMicroIntro(ctx, kpi, missingReport, adPitch) {
  const { name, period, hasClub } = ctx

  if (!hasClub) {
    return joinIskraReply(`${name} на связи.`, `${adPitch} Выберите филиал в шапке.`)
  }

  if (kpi && !kpi.hasPlan && (kpi.reportDays || 0) === 0) {
    return joinIskraReply(
      iskraReplyHeader(ctx.club, period),
      `Данных мало — начнём с отчётов.${missingReport}`,
    )
  }

  return joinIskraReply(iskraReplyHeader(ctx.club, period), `${adPitch}${missingReport}`)
}

function buildStandardIntro(ctx, missingReport, adPitch) {
  const { club, period, hasClub } = ctx

  if (!hasClub) {
    return joinIskraReply(
      'ИСКРА на связи.',
      `${adPitch} Выберите филиал в шапке — цифры по кнопке «План».`,
    )
  }

  return joinIskraReply(
    iskraReplyHeader(club, period),
    `${adPitch}${missingReport} Цифры месяца — кнопка «План».`,
  )
}

function buildCapabilitiesIntro(ctx, adPitch) {
  const { club, period, hasClub } = ctx

  if (!hasClub) {
    return joinIskraReply('ИСКРА на связи.', `${adPitch} Выберите филиал.`)
  }

  return joinIskraReply(iskraReplyHeader(club, period), `${adPitch} Кнопки снизу — готовые вопросы.`)
}

function buildSourcesIntro(ctx) {
  const { club, period, hasClub } = ctx

  if (!hasClub) {
    return joinIskraReply(
      'ИСКРА на связи.',
      'Цифры из отчётов менеджера и «Финансы клуба». Тренеры — по запросу.',
    )
  }

  return joinIskraReply(
    iskraReplyHeader(club, period),
    'Цифры из отчётов менеджера и «Финансы клуба». Тренеры с планшетов — по запросу.',
  )
}

function buildIdentityIntro(ctx) {
  const { fullName, club, period, hasClub } = ctx

  if (!hasClub) {
    return joinIskraReply(
      `${fullName} на связи.`,
      'Встроенная ЭВМ FIT-CITY, не Google и не ChatGPT. План и прогноз — из ваших отчётов.',
    )
  }

  return joinIskraReply(
    iskraReplyHeader(club, period),
    `${fullName} — бортовая ЭВМ приложения, не внешний чат. Цифры клуба из ваших отчётов.`,
  )
}

function buildDeepIntro(ctx, missingReport) {
  const { name, club, period, hasClub } = ctx
  if (!hasClub) {
    return joinIskraReply(`${name} на связи.`, `Выберите филиал — расскажу про план и прогноз за ${period}.`)
  }

  return joinIskraReply(
    iskraReplyHeader(club, period),
    `План по валу, возвраты в чистую прибыль, прогноз как «Финансы клуба». Оценки модели — с пометкой «Оценка ИСКРЫ».${missingReport}`,
  )
}

export function buildGeminiMicroIntro(opts = {}) {
  return buildGeminiIntroReply('micro', opts)
}

export function buildGeminiSelfPresentationRule() {
  return [
    'На «кто ты» — короткая бортовая реклама: чем помогаете управляющему (план, прогноз, риски, залы).',
    'Без цифр месяца и без повтора кнопки «План» — факты плана только когда спросили про план.',
    'Представься как ЭВС «ИСКРА», советская ЭВМ FIT-CITY, НЕ Google/Gemini/ChatGPT.',
    'Свои выводы — с пометкой «Оценка ИСКРЫ»; не акцентируй число отчётов.',
  ].join(' ')
}
