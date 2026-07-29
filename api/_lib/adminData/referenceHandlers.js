import { sendJson } from '../adminSupabase.js'
import { PAGE } from './constants.js'
import { fetchPaged } from './paging.js'

export async function handleChallenges(authCtx, req, res) {
  const clubId = String(req.query?.club_id ?? '').trim()
  if (!clubId) {
    sendJson(res, 400, { error: 'Укажите club_id' })
    return
  }
  if (authCtx.isTrainer && !authCtx.isAdmin) {
    const { data: prof } = await authCtx.supabaseAdmin
      .from('users')
      .select('club_id')
      .eq('id', authCtx.user.id)
      .maybeSingle()
    const trainerClub = String(prof?.club_id ?? '').trim()
    if (trainerClub && trainerClub !== clubId) {
      sendJson(res, 403, { error: 'Челленджи другого клуба недоступны' })
      return
    }
    if (!trainerClub) {
      const { data: sample } = await authCtx.supabaseAdmin
        .from('clients')
        .select('id')
        .eq('trainer_id', authCtx.user.id)
        .eq('club_id', clubId)
        .limit(1)
      if (!(sample ?? []).length) {
        sendJson(res, 403, { error: 'Челленджи другого клуба недоступны' })
        return
      }
    }
  }
  const { data, error } = await authCtx.supabaseAdmin
    .from('challenges')
    .select('*')
    .eq('club_id', clubId)
    .order('created_at', { ascending: false })
  if (error) {
    sendJson(res, 400, { error: error.message })
    return
  }
  sendJson(res, 200, { challenges: data ?? [], count: (data ?? []).length, club_id: clubId })
}

/** Завершённые и черновики тренировок клуба за период — для рейтинга челленджа. */
export async function handleChallengeTrainings(authCtx, req, res) {
  const clubId = String(req.query?.club_id ?? req.query?.clubId ?? '').trim()
  const dateFrom = String(req.query?.date_from ?? req.query?.dateFrom ?? '').trim()
  const dateTo = String(req.query?.date_to ?? req.query?.dateTo ?? '').trim()
  if (!clubId) {
    sendJson(res, 400, { error: 'Укажите club_id' })
    return
  }
  if (!dateFrom || !dateTo) {
    sendJson(res, 400, { error: 'Укажите date_from и date_to (YYYY-MM-DD)' })
    return
  }

  if (authCtx.isTrainer && !authCtx.isAdmin) {
    const { data: prof } = await authCtx.supabaseAdmin
      .from('users')
      .select('club_id')
      .eq('id', authCtx.user.id)
      .maybeSingle()
    const trainerClub = String(prof?.club_id ?? '').trim()
    if (trainerClub && trainerClub !== clubId) {
      sendJson(res, 403, { error: 'Тренировки другого клуба недоступны' })
      return
    }
    if (!trainerClub) {
      const { data: sample } = await authCtx.supabaseAdmin
        .from('clients')
        .select('id')
        .eq('trainer_id', authCtx.user.id)
        .eq('club_id', clubId)
        .limit(1)
      if (!(sample ?? []).length) {
        sendJson(res, 403, { error: 'Нет доступа к тренировкам этого клуба' })
        return
      }
    }
  }

  const trainings = await fetchPaged(authCtx.supabaseAdmin, 'trainings', '*', clubId, dateFrom, dateTo)
  sendJson(res, 200, { trainings, count: trainings.length, club_id: clubId, date_from: dateFrom, date_to: dateTo })
}

export async function handleClubs(ctx, res) {
  const { data, error } = await ctx.supabaseAdmin.from('clubs').select('*').order('id', { ascending: true })
  if (error) {
    sendJson(res, 400, { error: error.message })
    return
  }
  sendJson(res, 200, { clubs: data ?? [], count: (data ?? []).length })
}

export async function handleMembershipTypes(authCtx, req, res) {
  const clubId = String(req.query?.club_id ?? req.query?.clubId ?? '').trim()
  if (!clubId) {
    sendJson(res, 400, { error: 'Укажите club_id' })
    return
  }

  if (!authCtx.isAdmin) {
    const { data: prof } = await authCtx.supabaseAdmin
      .from('users')
      .select('club_id')
      .eq('id', authCtx.user.id)
      .maybeSingle()
    const profileClub = String(prof?.club_id ?? '').trim()
    if (profileClub && profileClub !== clubId) {
      sendJson(res, 403, { error: 'Типы другого клуба недоступны' })
      return
    }
    if (!profileClub) {
      if (authCtx.isSalesManager) {
        sendJson(res, 403, { error: 'Клуб не привязан к учётке менеджера' })
        return
      }
      const { data: sample } = await authCtx.supabaseAdmin
        .from('clients')
        .select('id')
        .eq('trainer_id', authCtx.user.id)
        .eq('club_id', clubId)
        .limit(1)
      if (!(sample ?? []).length) {
        sendJson(res, 403, { error: 'Нет доступа к типам этого клуба' })
        return
      }
    }
  }

  const { data, error } = await authCtx.supabaseAdmin
    .from('membership_types')
    .select('*')
    .eq('club_id', clubId)
    .order('sort_order', { ascending: true })
    .order('code', { ascending: true })
  if (error) {
    sendJson(res, 400, { error: error.message })
    return
  }
  const rows = data ?? []
  sendJson(res, 200, { membership_types: rows, count: rows.length, club_id: clubId })
}

export async function handleNutritionProducts(authCtx, req, res) {
  const clubId = String(req.query?.club_id ?? req.query?.clubId ?? '').trim()
  if (!clubId) {
    sendJson(res, 400, { error: 'Укажите club_id' })
    return
  }

  if (!authCtx.isAdmin) {
    const { data: prof } = await authCtx.supabaseAdmin
      .from('users')
      .select('club_id')
      .eq('id', authCtx.user.id)
      .maybeSingle()
    const trainerClub = String(prof?.club_id ?? '').trim()
    if (trainerClub && trainerClub !== clubId) {
      sendJson(res, 403, { error: 'Продукты другого клуба недоступны' })
      return
    }
    if (!trainerClub) {
      const { data: sample } = await authCtx.supabaseAdmin
        .from('clients')
        .select('id')
        .eq('trainer_id', authCtx.user.id)
        .eq('club_id', clubId)
        .limit(1)
      if (!(sample ?? []).length) {
        sendJson(res, 403, { error: 'Нет доступа к продуктам этого клуба' })
        return
      }
    }
  }

  const { data, error } = await authCtx.supabaseAdmin
    .from('nutrition_products')
    .select('*')
    .eq('club_id', clubId)
    .order('sort_order', { ascending: true })
    .order('label', { ascending: true })
  if (error) {
    sendJson(res, 400, { error: error.message })
    return
  }
  const rows = data ?? []
  sendJson(res, 200, { nutrition_products: rows, count: rows.length, club_id: clubId })
}

export async function handleHomeworkPresets(authCtx, req, res) {
  const clubId = String(req.query?.club_id ?? req.query?.clubId ?? '').trim()
  if (!clubId) {
    sendJson(res, 400, { error: 'Укажите club_id' })
    return
  }

  if (!authCtx.isAdmin) {
    const { data: prof } = await authCtx.supabaseAdmin
      .from('users')
      .select('club_id')
      .eq('id', authCtx.user.id)
      .maybeSingle()
    const trainerClub = String(prof?.club_id ?? '').trim()
    if (trainerClub && trainerClub !== clubId) {
      sendJson(res, 403, { error: 'Шаблоны ДЗ другого клуба недоступны' })
      return
    }
    if (!trainerClub) {
      const { data: sample } = await authCtx.supabaseAdmin
        .from('clients')
        .select('id')
        .eq('trainer_id', authCtx.user.id)
        .eq('club_id', clubId)
        .limit(1)
      if (!(sample ?? []).length) {
        sendJson(res, 403, { error: 'Нет доступа к шаблонам ДЗ этого клуба' })
        return
      }
    }
  }

  const { data, error } = await authCtx.supabaseAdmin
    .from('homework_presets')
    .select('*')
    .eq('club_id', clubId)
    .order('sort_order', { ascending: true })
    .order('title', { ascending: true })
  if (error) {
    sendJson(res, 400, { error: error.message })
    return
  }
  const rows = data ?? []
  sendJson(res, 200, { homework_presets: rows, count: rows.length, club_id: clubId })
}

export async function handleExercisesMeta(authCtx, res) {
  const { count, error: countErr } = await authCtx.supabaseAdmin
    .from('exercises')
    .select('*', { count: 'exact', head: true })
  if (countErr) {
    sendJson(res, 400, { error: countErr.message })
    return
  }
  const { data: latest, error: latestErr } = await authCtx.supabaseAdmin
    .from('exercises')
    .select('created_at')
    .order('created_at', { ascending: false })
    .limit(1)
  if (latestErr) {
    sendJson(res, 400, { error: latestErr.message })
    return
  }
  const max_created_at = latest?.[0]?.created_at ?? null
  sendJson(res, 200, { count: count ?? 0, max_created_at })
}

export async function handleExercises(authCtx, res) {
  const all = []
  let from = 0
  let maxCreatedAt = null
  for (;;) {
    const { data, error } = await authCtx.supabaseAdmin
      .from('exercises')
      .select('*')
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) {
      sendJson(res, 400, { error: error.message })
      return
    }
    const chunk = data ?? []
    for (const row of chunk) {
      const t = String(row.created_at ?? '')
      if (t && (!maxCreatedAt || t > maxCreatedAt)) maxCreatedAt = t
    }
    all.push(...chunk)
    if (chunk.length < PAGE) break
    from += PAGE
  }
  sendJson(res, 200, { exercises: all, count: all.length, max_created_at: maxCreatedAt })
}
