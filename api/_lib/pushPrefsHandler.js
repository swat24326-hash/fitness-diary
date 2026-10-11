import { sendJson } from './adminSupabase.js'
import { normalizeSchedulePrefsPayload } from './trainerSchedule/scheduleReminderCore.js'

const MISSING_SCHEMA = /does not exist|schedule_reminders|relation.*user_push_subscriptions/i

/**
 * Настройки уведомлений этого устройства (op: 'prefs'). Только своя подписка: user_id из сессии.
 * Без schedule_reminders — чтение; с boolean — запись.
 * @param {{ user?: { id?: string }, supabaseAdmin: object }} ctx
 * @param {object} res
 * @param {object} body
 */
export async function handlePushPrefsPost(ctx, res, body) {
  const normalized = normalizeSchedulePrefsPayload(body)
  if (!normalized.ok) {
    sendJson(res, 400, { error: normalized.error })
    return
  }
  const userId = String(ctx.user?.id ?? '').trim()
  const table = ctx.supabaseAdmin.from('user_push_subscriptions')
  const query =
    normalized.scheduleReminders === null
      ? table.select('schedule_reminders')
      : table.update({ schedule_reminders: normalized.scheduleReminders, updated_at: new Date().toISOString() }).select('schedule_reminders')
  try {
    const { data, error } = await query.eq('user_id', userId).eq('endpoint', normalized.endpoint)
    if (error) {
      if (MISSING_SCHEMA.test(String(error.message ?? ''))) {
        sendJson(res, 200, { ok: false, migration_pending: true })
        return
      }
      throw error
    }
    const row = Array.isArray(data) ? data[0] : null
    sendJson(res, 200, { ok: true, found: !!row, schedule_reminders: row ? row.schedule_reminders !== false : true })
  } catch (e) {
    sendJson(res, 400, { error: e?.message ? String(e.message) : 'Ошибка настройки уведомлений' })
  }
}
