import { sendJson } from '../adminSupabase.js'
import { CLIENT_BRIEF, IN_CHUNK } from './constants.js'

const JOURNAL_CAP = 2000
const PAGE = 500

/**
 * GET admin-data?action=trainer-self-journal&date_from=&date_to=&club_id=
 * Список завершённых тренировок тренера за период (как цифры в trainer-self-stats).
 * trainer_id всегда из JWT (админ может передать trainer_id + club_id).
 */
export async function handleTrainerSelfJournalGet(authCtx, req, res) {
  if (!authCtx.isTrainer && !authCtx.isAdmin) {
    sendJson(res, 403, { error: 'Нет доступа' })
    return
  }

  const dateFrom = String(req.query?.date_from ?? '').slice(0, 10)
  const dateTo = String(req.query?.date_to ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo) || dateFrom > dateTo) {
    sendJson(res, 400, { error: 'Укажите date_from и date_to (YYYY-MM-DD)' })
    return
  }

  const trainerId = String(authCtx.user?.id ?? '').trim()
  const profileClub = String(authCtx.profile?.club_id ?? '').trim()
  const hintClub = String(req.query?.club_id ?? '').trim()

  let effectiveTrainerId = trainerId
  let effectiveClubId = profileClub || hintClub

  if (authCtx.isAdmin && !authCtx.isTrainer) {
    effectiveTrainerId = String(req.query?.trainer_id ?? '').trim()
    effectiveClubId = String(req.query?.club_id ?? profileClub).trim()
    if (!effectiveTrainerId || !effectiveClubId) {
      sendJson(res, 400, { error: 'Админу нужны trainer_id и club_id' })
      return
    }
  } else {
    if (!trainerId) {
      sendJson(res, 401, { error: 'Unauthorized' })
      return
    }
    if (!effectiveClubId) {
      sendJson(res, 400, {
        error: 'В профиле нет клуба — попросите администратора указать клуб тренеру',
      })
      return
    }
    if (profileClub && hintClub && profileClub !== hintClub) {
      effectiveClubId = profileClub
    }
  }

  const { supabaseAdmin } = authCtx
  const rows = []
  let from = 0
  let truncated = false

  try {
    for (;;) {
      if (rows.length >= JOURNAL_CAP) {
        truncated = true
        break
      }
      const room = JOURNAL_CAP - rows.length
      const limit = Math.min(PAGE, room)
      const { data, error } = await supabaseAdmin
        .from('trainings')
        .select('*')
        .eq('club_id', effectiveClubId)
        .eq('trainer_id', effectiveTrainerId)
        .eq('status', 'completed')
        .gte('date', dateFrom)
        .lte('date', dateTo)
        .order('date', { ascending: false })
        .order('id', { ascending: false })
        .range(from, from + limit - 1)
      if (error) {
        sendJson(res, 400, { error: error.message })
        return
      }
      const chunk = data ?? []
      rows.push(...chunk)
      if (chunk.length < limit) break
      from += limit
    }

    const clientIds = [...new Set(rows.map((t) => t.client_id).filter(Boolean))]
    const clientsById = {}
    for (let i = 0; i < clientIds.length; i += IN_CHUNK) {
      const chunk = clientIds.slice(i, i + IN_CHUNK)
      const { data: clients, error: ce } = await supabaseAdmin
        .from('clients')
        .select(CLIENT_BRIEF)
        .in('id', chunk)
      if (ce) {
        sendJson(res, 400, { error: ce.message })
        return
      }
      for (const c of clients ?? []) clientsById[c.id] = c
    }

    sendJson(res, 200, {
      trainings: rows,
      clientsById,
      totalCount: rows.length,
      truncated,
      date_from: dateFrom,
      date_to: dateTo,
      club_id: effectiveClubId,
      trainer_id: effectiveTrainerId,
    })
  } catch (e) {
    console.warn('[trainer-self-journal]', e)
    sendJson(res, 500, { error: e?.message ? String(e.message).slice(0, 200) : 'Ошибка журнала' })
  }
}
