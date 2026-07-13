/**
 * Планёрка — ручные и контекстные задания (O1 + O2).
 */

import { formatDateRu } from '../dateRu.js'
import { resolveDeepLinkForTaskKind, resolveTaskKindFromInsight } from './iskraTaskKindsCore.js'
import { buildClientCardDeepLink, buildSalesReportDeepLink } from './staffTaskDeepLinkCore.js'

/** @typedef {'manual_app' | 'iskra_insight_card' | 'client_card' | 'sales_report' | 'week_checklist' | 'auto_trigger' | ''} StaffTaskSourceChannel */

export const STAFF_TASK_SOURCE_CHANNELS = /** @type {const} */ ([
  '',
  'manual_app',
  'iskra_insight_card',
  'client_card',
  'sales_report',
  'week_checklist',
  'auto_trigger',
])

/**
 * Черновик ручного задания без ИСКРЫ (форма «Задания клуба»).
 * @param {{ title?: string, body?: string, taskKind?: string, priority?: string, duePreset?: string, contextJson?: object }} [opts]
 */
export function buildManualTaskDraft(opts = {}) {
  const title = String(opts.title ?? '').trim()
  const body = String(opts.body ?? '').trim()
  const taskKind = String(opts.taskKind ?? 'custom').trim() || 'custom'
  const priority = String(opts.priority ?? 'normal').trim() || 'normal'
  const duePreset = String(opts.duePreset ?? '3days').trim() || '3days'

  return {
    title: title || 'Задание от руководителя',
    body: body || 'Опишите, что нужно сделать, и до какого срока.',
    insight_key: '',
    source: /** @type {'admin'} */ ('admin'),
    source_channel: /** @type {'manual_app'} */ ('manual_app'),
    task_kind: taskKind,
    priority,
    due_preset: duePreset,
    context_json: normalizeStaffTaskContextJson(opts.contextJson),
  }
}

/**
 * @param {unknown} raw
 * @returns {Record<string, unknown>}
 */
export function normalizeStaffTaskContextJson(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out = {}
  for (const [k, v] of Object.entries(raw)) {
    const key = String(k).trim().slice(0, 64)
    if (!key) continue
    if (v == null) continue
    if (typeof v === 'string') {
      out[key] = v.slice(0, 500)
      continue
    }
    if (typeof v === 'number' && Number.isFinite(v)) {
      out[key] = v
      continue
    }
    if (typeof v === 'boolean') {
      out[key] = v
    }
  }
  return out
}

/**
 * @param {string} channel
 */
export function staffTaskSourceChannelLabel(channel) {
  const map = {
    manual_app: 'Вручную',
    iskra_insight_card: 'Карточка ИСКРЫ',
    client_card: 'Карточка клиента',
    sales_report: 'Отчёт продаж',
    week_checklist: 'Чеклист недели',
    auto_trigger: 'Авто-триггер',
  }
  const key = String(channel ?? '').trim()
  return map[key] ?? (key ? key : '—')
}

/**
 * @param {string} channel
 */
export function isManualStaffTaskChannel(channel) {
  return String(channel ?? '').trim() === 'manual_app'
}

/**
 * Задание из карточки клиента (админ → тренер клиента).
 * @param {{ id?: string, name?: string, trainer_id?: string, club_id?: string }} client
 * @param {{ taskKind?: string, body?: string, duePreset?: string }} [opts]
 */
export function buildClientCardTaskDraft(client, opts = {}) {
  const name = String(client?.name ?? 'клиент').trim()
  const clientId = String(client?.id ?? '').trim()
  const trainerId = String(client?.trainer_id ?? '').trim()
  const clubId = String(client?.club_id ?? '').trim()
  const taskKind = String(opts.taskKind ?? 'reactivate_clients').trim() || 'reactivate_clients'
  const customBody = String(opts.body ?? '').trim()

  return {
    title: `Клиент · ${name}`.slice(0, 200),
    body: (
      customBody ||
      `Связаться с клиентом ${name} и выполнить договорённость. Карточка клиента — по кнопке «Перейти».`
    ).slice(0, 2000),
    insight_key: '',
    source: /** @type {'admin'} */ ('admin'),
    source_channel: /** @type {'client_card'} */ ('client_card'),
    task_kind: taskKind,
    priority: 'normal',
    due_preset: String(opts.duePreset ?? '3days').trim() || '3days',
    context_json: normalizeStaffTaskContextJson({
      client_id: clientId,
      client_name: name,
      club_id: clubId,
      trainer_id: trainerId,
    }),
    deep_link: buildClientCardDeepLink(clientId),
    default_recipient_id: trainerId,
  }
}

/**
 * Задание из отчёта продаж (админ → менеджер по продажам).
 * @param {{ clubId: string, reportDate: string, clubName?: string }} opts
 */
export function buildSalesReportTaskDraft(opts) {
  const clubId = String(opts.clubId ?? '').trim()
  const reportDate = String(opts.reportDate ?? '').trim()
  const clubName = String(opts.clubName ?? 'клуб').trim()
  const dateLabel = reportDate ? formatDateRu(reportDate) : 'день'

  return {
    title: `Отчёт · ${dateLabel}`.slice(0, 200),
    body: `Внести или проверить дневной отчёт продаж за ${dateLabel}. Клуб: ${clubName}.`.slice(0, 2000),
    insight_key: 'report_today',
    source: /** @type {'admin'} */ ('admin'),
    source_channel: /** @type {'sales_report'} */ ('sales_report'),
    task_kind: 'daily_report',
    priority: 'high',
    due_preset: 'tomorrow',
    context_json: normalizeStaffTaskContextJson({
      club_id: clubId,
      report_date: reportDate,
    }),
    deep_link: buildSalesReportDeepLink({ reportDate, forAdmin: false }),
    default_recipient_id: '',
  }
}

/**
 * Задание из чеклиста недели ИСКРЫ.
 * @param {{ id?: string, label?: string, detail?: string }} item
 * @param {{ clubId: string, year: number, month: number }} opts
 */
export function buildWeekChecklistTaskDraft(item, opts) {
  const label = String(item?.label ?? 'Действие недели').trim()
  const detail = String(item?.detail ?? label).trim()
  const insightKey = String(item?.id ?? '').trim()
  const taskKind = resolveTaskKindFromInsight(insightKey)
  const clubId = String(opts?.clubId ?? '').trim()
  const year = Number(opts?.year)
  const month = Number(opts?.month)

  return {
    title: `ИСКРА · ${label}`.slice(0, 200),
    body: detail.slice(0, 2000),
    insight_key: insightKey,
    source: /** @type {'admin'} */ ('admin'),
    source_channel: /** @type {'week_checklist'} */ ('week_checklist'),
    task_kind: taskKind,
    priority: insightKey === 'inactive_clients' || insightKey === 'report_today' ? 'high' : 'normal',
    due_preset: '3days',
    context_json: normalizeStaffTaskContextJson({
      club_id: clubId,
      checklist_item_id: insightKey,
      period_year: Number.isFinite(year) ? Math.trunc(year) : null,
      period_month: Number.isFinite(month) && month >= 1 && month <= 12 ? Math.trunc(month) : null,
    }),
    deep_link: resolveDeepLinkForTaskKind(taskKind),
    default_recipient_id: '',
  }
}
