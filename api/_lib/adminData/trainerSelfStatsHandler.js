import { sendJson } from '../adminSupabase.js'
import { buildTrainerSelfStatsPayload } from '../trainerSelfStatsCore.js'

/**
 * GET admin-data?action=trainer-self-stats&date_from=&date_to=&day=&club_id=
 * trainer_id всегда = JWT; club_id из профиля, иначе подсказка с клиента (тот же uid).
 */
export async function handleTrainerSelfStatsGet(authCtx, req, res) {
  if (!authCtx.isTrainer && !authCtx.isAdmin) {
    sendJson(res, 403, { error: 'Нет доступа' })
    return
  }

  const dateFrom = String(req.query?.date_from ?? '').slice(0, 10)
  const dateTo = String(req.query?.date_to ?? '').slice(0, 10)
  const dayIso = String(req.query?.day ?? dateTo).slice(0, 10)

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo) || dateFrom > dateTo) {
    sendJson(res, 400, { error: 'Укажите date_from и date_to (YYYY-MM-DD)' })
    return
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayIso)) {
    sendJson(res, 400, { error: 'Некорректный day' })
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
    // Клиент прислал другой club_id, чем в users — берём профиль (источник истины).
    if (profileClub && hintClub && profileClub !== hintClub) {
      effectiveClubId = profileClub
    }
  }

  try {
    const payload = await buildTrainerSelfStatsPayload(authCtx.supabaseAdmin, {
      trainerId: effectiveTrainerId,
      clubId: effectiveClubId,
      dateFrom,
      dateTo,
      dayIso,
    })
    sendJson(res, 200, payload)
  } catch (e) {
    console.warn('[trainer-self-stats]', e)
    sendJson(res, 500, { error: e?.message ? String(e.message).slice(0, 200) : 'Ошибка расчёта' })
  }
}
