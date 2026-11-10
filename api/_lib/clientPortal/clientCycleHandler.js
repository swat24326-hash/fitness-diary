/**
 * POST /api/client-me { action: 'cycle-get' | 'cycle-upsert' | 'cycle-disable' }
 * Параметры цикла — только свой client_id; тренеру не отдаём.
 */
import { sendJson } from '../adminSupabase.js'
import { clubOpsAsOfIso } from '../adminData/loyaltyAccountQuery.js'
import { parseCycleSettingsInput, publicClientCycle } from '../../../src/lib/client/clientCycleCalendarCore.js'

const SELECT = 'client_id, enabled, cycle_days, period_days, last_period_start, updated_at'

function isMissingTable(e) {
  return /client_cycle_settings|42P01|PGRST205|does not exist/i.test(String(e?.message ?? e?.code ?? ''))
}

function missingSchema(res) {
  sendJson(res, 503, { error: 'Цикл ещё не подключен — обновите клуб' })
}

async function loadRow(db, clientId) {
  const { data, error } = await db.from('client_cycle_settings').select(SELECT).eq('client_id', clientId).maybeSingle()
  if (error) throw error
  return data ?? null
}

export async function loadClientCycle(db, clientId) {
  try {
    const row = await loadRow(db, clientId)
    return publicClientCycle(row)
  } catch (e) {
    if (isMissingTable(e)) return { enabled: false }
    throw e
  }
}

function respond(res, cycle, extra = {}) {
  sendJson(res, 200, { ok: true, cycle, ...extra })
}

async function upsertCycle(db, ctx, body, res) {
  const today = clubOpsAsOfIso()
  const parsed = parseCycleSettingsInput(
    {
      enabled: true,
      cycle_days: body?.cycle_days,
      period_days: body?.period_days,
      last_period_start: body?.last_period_start,
    },
    today,
  )
  if (!parsed.ok) {
    sendJson(res, 400, { error: parsed.error })
    return
  }
  const v = parsed.value
  const row = {
    client_id: ctx.clientId,
    enabled: true,
    cycle_days: v.cycle_days,
    period_days: v.period_days,
    last_period_start: v.last_period_start,
    updated_at: new Date().toISOString(),
  }
  try {
    const { error } = await db.from('client_cycle_settings').upsert(row, { onConflict: 'client_id' })
    if (error) throw error
    respond(res, publicClientCycle(row))
  } catch (e) {
    if (isMissingTable(e)) {
      missingSchema(res)
      return
    }
    throw e
  }
}

async function disableCycle(db, ctx, res) {
  const row = {
    client_id: ctx.clientId,
    enabled: false,
    cycle_days: 28,
    period_days: 5,
    last_period_start: null,
    updated_at: new Date().toISOString(),
  }
  try {
    const { error } = await db.from('client_cycle_settings').upsert(row, { onConflict: 'client_id' })
    if (error) throw error
    respond(res, publicClientCycle(row))
  } catch (e) {
    if (isMissingTable(e)) {
      missingSchema(res)
      return
    }
    throw e
  }
}

export function isCycleAction(action) {
  return String(action ?? '').startsWith('cycle-')
}

/**
 * @param {import('../pgRest/serviceClient.js').ServiceDataClient} db
 * @param {{ clientId: string }} ctx
 */
export async function handleClientCyclePost(db, ctx, body, res) {
  const action = String(body?.action ?? '')
  if (action === 'cycle-get') {
    try {
      respond(res, await loadClientCycle(db, ctx.clientId))
    } catch (e) {
      if (isMissingTable(e)) {
        missingSchema(res)
        return
      }
      throw e
    }
    return
  }
  if (action === 'cycle-upsert') {
    await upsertCycle(db, ctx, body, res)
    return
  }
  if (action === 'cycle-disable') {
    await disableCycle(db, ctx, res)
    return
  }
  sendJson(res, 400, { error: 'Неизвестное действие' })
}
