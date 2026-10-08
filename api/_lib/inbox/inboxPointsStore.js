/**
 * Баллы за опросы (service role): начисления из inbox_deliveries, списания из inbox_points_redemptions.
 */
import { computeSurveyPoints, surveyPointsHistory } from '../../../src/lib/inbox/inboxPointsCore.js'
import { isMissingInboxTable } from './inboxMailbox.js'
import { rows } from './inboxStore.js'

function isMissingPointsTable(e) {
  const msg = String(e?.message ?? '')
  return isMissingInboxTable(e) || (/inbox_points_redemptions/.test(msg) && /does not exist|relation/i.test(msg))
}

/** До миграции — пустой счёт, экраны не ломаем. */
async function loadRaw(db, clientId) {
  try {
    return await loadRawStrict(db, clientId)
  } catch (e) {
    if (isMissingPointsTable(e)) return { grants: [], redemptions: [] }
    throw e
  }
}

async function loadRawStrict(db, clientId) {
  const [grants, redemptions] = await Promise.all([
    rows(
      db
        .from('inbox_deliveries')
        .select('campaign_id, reward_points, reward_granted_at')
        .eq('client_id', clientId)
        .not('reward_granted_at', 'is', null),
    ),
    rows(db.from('inbox_points_redemptions').select('points, comment, created_at').eq('client_id', clientId).order('created_at', { ascending: false })),
  ])
  return { grants, redemptions }
}

export async function loadSurveyPointsBalance(db, clientId) {
  const { grants, redemptions } = await loadRaw(db, clientId)
  return computeSurveyPoints(grants, redemptions).balance
}

/** Баланс + лента для стойки (названия опросов подтягиваем одним запросом). */
export async function loadSurveyPointsAccount(db, clientId) {
  const { grants, redemptions } = await loadRaw(db, clientId)
  const ids = [...new Set(grants.map((g) => String(g.campaign_id)))]
  const campaigns = ids.length ? await rows(db.from('inbox_campaigns').select('id, title').in('id', ids)) : []
  const titleOf = new Map(campaigns.map((c) => [String(c.id), String(c.title ?? '')]))
  return {
    ...computeSurveyPoints(grants, redemptions),
    history: surveyPointsHistory(
      grants.map((g) => ({ ...g, title: titleOf.get(String(g.campaign_id)) })),
      redemptions,
    ),
  }
}

/** Списания клуба для общего журнала баллов; до миграции — пусто. */
export async function loadSurveyPointsRedemptionsForClub(db, clubId, limit) {
  try {
    return await rows(
      db
        .from('inbox_points_redemptions')
        .select('id, club_id, client_id, points, comment, actor_id, created_at')
        .eq('club_id', clubId)
        .order('created_at', { ascending: false })
        .limit(limit),
    )
  } catch (e) {
    if (isMissingPointsTable(e)) return []
    throw e
  }
}

export async function insertSurveyPointsRedemption(db, row) {
  const { error } = await db.from('inbox_points_redemptions').insert(row)
  if (error) throw error
}
