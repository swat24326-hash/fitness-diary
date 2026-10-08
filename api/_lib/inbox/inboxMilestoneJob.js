/**
 * Автоопрос «после 10-й тренировки»: доставка клиенту, дошедшему до рубежа. Повторный вызов безопасен —
 * уже доставленное пропускаем, гонку двух вызовов ловит уникальный индекс (campaign_id, client_id).
 * Вызов: фоном после sync тренировки (с push) и при открытии /me (без push — клиент уже в приложении).
 */
import { pickMilestoneCampaigns, isMilestoneTrainingRow } from '../../../src/lib/inbox/inboxTriggerCore.js'
import { isMissingInboxTable } from './inboxMailbox.js'
import { inboxPushBlocker, sendInboxPush } from './inboxPushJob.js'
import { insertInboxDeliveries, rows } from './inboxStore.js'

/** Тренировок читаем с запасом: списания в счёт не идут. */
const TRAININGS_SCAN = 40

function isDuplicate(e) {
  return String(e?.code ?? '') === '23505' || /duplicate key|unique/i.test(String(e?.message ?? ''))
}

async function hasLiveSession(db, clientId) {
  const live = await rows(db.from('client_sessions').select('id').eq('client_id', clientId).is('revoked_at', null).limit(1))
  return live.length > 0
}

/**
 * @param {{ push?: boolean, knownSession?: boolean }} [opts]
 * @returns {Promise<number>} сколько автоопросов доставлено
 */
export async function ensureMilestoneSurveys(db, clientId, opts = {}) {
  const campaigns = await rows(db.from('inbox_campaigns').select('*').not('trigger', 'is', null).is('closed_at', null))
  if (!campaigns.length) return 0
  const { data: client, error } = await db.from('clients').select('id, club_id, archived_at').eq('id', clientId).maybeSingle()
  if (error) throw error
  if (!client || client.archived_at) return 0
  const forClub = campaigns.filter((c) => (c.club_ids ?? []).map(String).includes(String(client.club_id)))
  if (!forClub.length) return 0
  const [trainings, delivered] = await Promise.all([
    rows(
      db
        .from('trainings')
        .select('date, status, type')
        .eq('client_id', clientId)
        .eq('status', 'completed')
        .order('date', { ascending: true })
        .limit(TRAININGS_SCAN),
    ),
    rows(db.from('inbox_deliveries').select('campaign_id').eq('client_id', clientId).in('campaign_id', forClub.map((c) => c.id))),
  ])
  const due = pickMilestoneCampaigns({
    campaigns: forClub,
    trainings,
    clubId: client.club_id,
    deliveredIds: delivered.map((d) => d.campaign_id),
  })
  if (!due.length || (!opts.knownSession && !(await hasLiveSession(db, clientId)))) return 0
  const recipient = { client_id: client.id, club_id: client.club_id }
  let count = 0
  for (const campaign of due) {
    try {
      await insertInboxDeliveries(db, campaign.id, [recipient], campaign.reward_points)
    } catch (e) {
      if (isDuplicate(e)) continue
      throw e
    }
    count += 1
    if (opts.push && !inboxPushBlocker()) await sendInboxPush(db, campaign, [recipient])
  }
  return count
}

/** Фоном после ответа push-record(s): ответ тренеру не ждёт, ошибки только в лог. */
export function scheduleMilestoneSurveys(db, pushedRows) {
  const ids = [...new Set((pushedRows ?? []).filter(isMilestoneTrainingRow).map((r) => String(r.client_id)))]
  if (!ids.length) return
  void (async () => {
    for (const id of ids) {
      try {
        await ensureMilestoneSurveys(db, id, { push: true })
      } catch (e) {
        if (!isMissingInboxTable(e) && !/trigger/.test(String(e?.message ?? ''))) console.warn('[inbox-milestone]', e?.message || e)
      }
    }
  })()
}
