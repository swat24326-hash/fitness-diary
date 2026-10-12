/**
 * Задание от тренера и рацион в приложении клиента. Только свои строки (client_id из токена).
 * GET /api/client-me → поле plans: последнее по каждому виду для плиток (summary, без снимка).
 * POST { action: 'plan-list', kind } → прошлые отправки этого вида.
 * POST { action: 'plan-item', id } → снимок; первое открытие ставит client_seen_at («Клиент открыл» у тренера).
 */
import { sendJson } from '../adminSupabase.js'
import { isClientPlanId, isClientPlanKind, sanitizeClientPlanPayload, summarizeClientPlan } from '../../../src/lib/clientPlans/clientPlanCore.js'

const LIST_LIMIT = 30
const BRIEF = 'id, kind, sent_at, sent_by, client_seen_at, summary'

async function rows(query) {
  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

async function trainerNames(db, list) {
  const ids = [...new Set(list.map((r) => String(r.sent_by ?? '')).filter(Boolean))]
  if (!ids.length) return new Map()
  const users = await rows(db.from('users').select('id, name').in('id', ids))
  return new Map(users.map((u) => [String(u.id), String(u.name ?? '').trim()]))
}

function briefView(row, names) {
  return {
    id: String(row.id),
    kind: row.kind,
    sent_at: row.sent_at,
    trainer_name: names.get(String(row.sent_by ?? '')) || null,
    seen: Boolean(row.client_seen_at),
    summary: row.summary && typeof row.summary === 'object' ? row.summary : {},
  }
}

function latestOf(db, clientId, kind) {
  return rows(db.from('client_plans').select(BRIEF).eq('client_id', clientId).eq('kind', kind).order('sent_at', { ascending: false }).limit(1))
}

/** Для GET: { homework: brief|null, nutrition: brief|null }. Ошибка таблицы не роняет главную. */
export async function loadClientPlansSummary(db, clientId) {
  try {
    const [hw, nu] = await Promise.all([latestOf(db, clientId, 'homework'), latestOf(db, clientId, 'nutrition')])
    const names = await trainerNames(db, [...hw, ...nu])
    return { homework: hw[0] ? briefView(hw[0], names) : null, nutrition: nu[0] ? briefView(nu[0], names) : null }
  } catch (e) {
    console.warn('[client-plans] summary', e?.message || e)
    return { homework: null, nutrition: null }
  }
}

async function handleList(db, ctx, kind, res) {
  if (!isClientPlanKind(kind)) {
    sendJson(res, 400, { error: 'Неизвестный раздел' })
    return
  }
  const list = await rows(
    db.from('client_plans').select(BRIEF).eq('client_id', ctx.clientId).eq('kind', kind).order('sent_at', { ascending: false }).limit(LIST_LIMIT),
  )
  const names = await trainerNames(db, list)
  sendJson(res, 200, { items: list.map((r) => briefView(r, names)) })
}

async function handleItem(db, ctx, id, res) {
  if (!isClientPlanId(id)) {
    sendJson(res, 400, { error: 'Неверное задание' })
    return
  }
  const found = await rows(
    db.from('client_plans').select('id, kind, sent_at, sent_by, client_seen_at, payload').eq('id', id).eq('client_id', ctx.clientId).limit(1),
  )
  const row = found[0]
  const payload = row ? sanitizeClientPlanPayload(row.kind, row.payload) : null
  if (!row || !payload) {
    sendJson(res, 404, { error: 'Задание не найдено' })
    return
  }
  if (!row.client_seen_at) {
    await rows(
      db.from('client_plans').update({ client_seen_at: new Date().toISOString() }).eq('id', row.id).is('client_seen_at', null).select('id'),
    )
  }
  const names = await trainerNames(db, [row])
  sendJson(res, 200, {
    item: { ...briefView({ ...row, client_seen_at: true, summary: summarizeClientPlan(row.kind, payload) }, names), payload },
  })
}

export async function handleClientPlansPost(db, ctx, body, res) {
  if (body?.action === 'plan-list') await handleList(db, ctx, body.kind, res)
  else await handleItem(db, ctx, body?.id, res)
}
