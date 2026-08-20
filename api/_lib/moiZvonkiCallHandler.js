import { sendJson } from './adminSupabase.js'
import {
  buildClubCallLogInsertRow,
  buildClubCallStaffNotePatch,
  clampClubCallLogSinceDays,
  CLUB_CALL_LOG_MAX_ROWS,
  clubCallLogSinceIso,
  shapeClubCallLogApiRow,
} from '../../src/lib/admin/clubCallLogCore.js'
import {
  buildCallTodayGlance,
  CALL_TODAY_LOOKBACK_DAYS,
  CALL_TODAY_MAX_ITEMS,
} from '../../src/lib/admin/salesCallTodayCore.js'
import {
  checkClubCallRateLimit,
  getMoiZvonkiConfigFromEnv,
  isMoiZvonkiConfigReady,
  isValidMoiZvonkiPhone,
  normalizeMoiZvonkiPhone,
  sendMoiZvonkiCall,
} from './moiZvonkiCore.js'
import {
  resolveMoiZvonkiConfig,
  shapeMoiZvonkiPublicStatus,
} from '../../src/lib/admin/moiZvonkiClubConfigCore.js'
import { todayInTimeZoneIso, CLUB_OPS_TIMEZONE, clubOpsDayBoundsUtc, normalizeClubOpsDayIso } from '../../src/lib/dateRu.js'

/**
 * @param {object} ctx
 * @param {string} clubId
 */
async function loadClubMoiZvonkiResolved(ctx, clubId) {
  let clubStored = null
  if (clubId && ctx?.supabaseAdmin) {
    try {
      const { data } = await ctx.supabaseAdmin
        .from('club_iskra_settings')
        .select('moizvonki')
        .eq('club_id', clubId)
        .maybeSingle()
      clubStored = data?.moizvonki ?? null
    } catch {
      /* fall through */
    }
  }
  return resolveMoiZvonkiConfig({
    clubStored,
    envConfig: getMoiZvonkiConfigFromEnv(),
  })
}

/**
 * @param {object} ctx
 * @param {string} clubId
 * @param {unknown} sinceDaysRaw
 * @param {string} [clientId]
 * @param {unknown} [dayRaw] — YYYY-MM-DD (календарь клуба МСК); иначе since_days
 */
async function fetchClubCallLogsForClub(ctx, clubId, sinceDaysRaw, clientId = '', dayRaw = '') {
  const day = normalizeClubOpsDayIso(dayRaw, todayInTimeZoneIso(CLUB_OPS_TIMEZONE))
  const sinceDays = clampClubCallLogSinceDays(sinceDaysRaw)
  const sinceIso = clubCallLogSinceIso(todayInTimeZoneIso(CLUB_OPS_TIMEZONE), sinceDays)
  const dayBounds = day ? clubOpsDayBoundsUtc(day, CLUB_OPS_TIMEZONE) : null
  const clientFilter = String(clientId ?? '').trim()

  const applyTime = (q) => {
    if (dayBounds) return q.gte('created_at', dayBounds.gte).lt('created_at', dayBounds.lt)
    return q.gte('created_at', sinceIso)
  }

  let q = applyTime(
    ctx.supabaseAdmin
      .from('club_call_log')
      .select(
        'id, club_id, client_id, sent_by, phone, status, error_message, created_at, direction, outcome, answered, duration_sec, mz_db_call_id, src_number, finished_at, recording_url, staff_note, staff_note_at, staff_note_by, staff_note_chip_id, callback_on',
      )
      .eq('club_id', clubId)
      .order('created_at', { ascending: false })
      .limit(CLUB_CALL_LOG_MAX_ROWS),
  )
  if (clientFilter) q = q.eq('client_id', clientFilter)

  let { data: rows, error } = await q

  if (error && /direction/i.test(String(error.message ?? ''))) {
    let qNoDir = applyTime(
      ctx.supabaseAdmin
        .from('club_call_log')
        .select(
          'id, club_id, client_id, sent_by, phone, status, error_message, created_at, outcome, answered, duration_sec, mz_db_call_id, src_number, finished_at, recording_url, staff_note, staff_note_at, staff_note_by, staff_note_chip_id, callback_on',
        )
        .eq('club_id', clubId)
        .order('created_at', { ascending: false })
        .limit(CLUB_CALL_LOG_MAX_ROWS),
    )
    if (clientFilter) qNoDir = qNoDir.eq('client_id', clientFilter)
    const midDir = await qNoDir
    rows = midDir.data
    error = midDir.error
  }

  if (error && /staff_note/i.test(String(error.message ?? ''))) {
    let qNoNote = applyTime(
      ctx.supabaseAdmin
        .from('club_call_log')
        .select(
          'id, club_id, client_id, sent_by, phone, status, error_message, created_at, outcome, answered, duration_sec, mz_db_call_id, src_number, finished_at, recording_url',
        )
        .eq('club_id', clubId)
        .order('created_at', { ascending: false })
        .limit(CLUB_CALL_LOG_MAX_ROWS),
    )
    if (clientFilter) qNoNote = qNoNote.eq('client_id', clientFilter)
    const mid = await qNoNote
    rows = mid.data
    error = mid.error
  }

  if (error && /outcome|duration_sec|finished_at|recording_url|schema cache|column/i.test(String(error.message ?? ''))) {
    let qLegacy = applyTime(
      ctx.supabaseAdmin
        .from('club_call_log')
        .select('id, club_id, client_id, sent_by, phone, status, error_message, created_at')
        .eq('club_id', clubId)
        .order('created_at', { ascending: false })
        .limit(CLUB_CALL_LOG_MAX_ROWS),
    )
    if (clientFilter) qLegacy = qLegacy.eq('client_id', clientFilter)
    const legacy = await qLegacy
    rows = legacy.data
    error = legacy.error
  }

  if (error) throw new Error(error.message || 'club_call_log query failed')

  const list = rows ?? []
  const clientIds = [...new Set(list.map((r) => String(r.client_id)).filter(Boolean))]
  const senderIds = [...new Set(list.map((r) => String(r.sent_by || '')).filter(Boolean))]

  /** @type {Record<string, string>} */
  const clientNames = {}
  /** @type {Record<string, string>} */
  const senderNames = {}

  if (clientIds.length) {
    const { data: clients } = await ctx.supabaseAdmin
      .from('clients')
      .select('id, name')
      .in('id', clientIds)
    for (const c of clients ?? []) {
      clientNames[String(c.id)] = String(c.name ?? '').trim() || '—'
    }
  }
  if (senderIds.length) {
    const { data: users } = await ctx.supabaseAdmin
      .from('users')
      .select('id, name')
      .in('id', senderIds)
    for (const u of users ?? []) {
      senderNames[String(u.id)] = String(u.name ?? '').trim() || '—'
    }
  }

  return list
    .map((row) =>
      shapeClubCallLogApiRow(row, {
        clientName: clientNames[String(row.client_id)],
        sentByName: row.sent_by ? senderNames[String(row.sent_by)] : null,
      }),
    )
    .filter(Boolean)
}

/**
 * @param {object} ctx
 * @param {Parameters<typeof buildClubCallLogInsertRow>[0]} input
 */
async function insertClubCallLogRow(ctx, input) {
  const built = buildClubCallLogInsertRow(input)
  if (!built.ok) return { log_id: null, log_warning: built.error }
  let { data: inserted, error: insertErr } = await ctx.supabaseAdmin
    .from('club_call_log')
    .insert(built.row)
    .select('id')
    .maybeSingle()
  if (insertErr && /direction/i.test(String(insertErr.message ?? ''))) {
    const { direction: _dir, ...withoutDir } = built.row
    const retry = await ctx.supabaseAdmin.from('club_call_log').insert(withoutDir).select('id').maybeSingle()
    inserted = retry.data
    insertErr = retry.error
  }
  if (insertErr) {
    return {
      log_id: null,
      log_warning: String(insertErr.message ?? 'journal_insert_failed').slice(0, 160),
    }
  }
  return { log_id: inserted?.id ? String(inserted.id) : null }
}

/**
 * GET admin-data?action=club-call&club_id=
 * Опционально: &logs=1&since_days=14&day=YYYY-MM-DD&client_id=
 * Опционально: &glance=1 — очередь «кому звонить» из журнала/пометок
 * @param {object} ctx
 * @param {object} req
 * @param {object} res
 */
export async function handleClubCallGet(ctx, req, res) {
  const clubId = String(req.query?.club_id ?? '').trim()
  const clientIdFilter = String(req.query?.client_id ?? '').trim()
  const wantLogs =
    String(req.query?.logs ?? '') === '1' ||
    String(req.query?.logs ?? '').toLowerCase() === 'true'
  const wantGlance =
    String(req.query?.glance ?? '') === '1' ||
    String(req.query?.glance ?? '').toLowerCase() === 'true'

  let clubName = ''
  let mzPublic = shapeMoiZvonkiPublicStatus(
    resolveMoiZvonkiConfig({ envConfig: getMoiZvonkiConfigFromEnv() }),
  )

  if (clubId && ctx?.supabaseAdmin) {
    try {
      const [{ data: settings }, { data: club }] = await Promise.all([
        ctx.supabaseAdmin
          .from('club_iskra_settings')
          .select('moizvonki')
          .eq('club_id', clubId)
          .maybeSingle(),
        ctx.supabaseAdmin.from('clubs').select('name').eq('id', clubId).maybeSingle(),
      ])
      clubName = String(club?.name ?? '').trim()
      const resolved = resolveMoiZvonkiConfig({
        clubStored: settings?.moizvonki ?? null,
        envConfig: getMoiZvonkiConfigFromEnv(),
      })
      mzPublic = shapeMoiZvonkiPublicStatus(resolved)
    } catch {
      /* keep env status */
    }
  }

  /** @type {object[] | undefined} */
  let logs
  let logs_error
  /** @type {{ items: object[], total: number } | undefined} */
  let glance
  let glance_error

  if ((wantLogs || wantGlance) && clubId && ctx?.supabaseAdmin) {
    try {
      const sinceForLogs = wantLogs ? req.query?.since_days : undefined
      const sinceForGlance = wantGlance
        ? req.query?.since_days || CALL_TODAY_LOOKBACK_DAYS
        : sinceForLogs
      const sinceRaw = wantGlance && !wantLogs ? sinceForGlance : sinceForLogs ?? sinceForGlance
      const dayForLogs = wantLogs && !wantGlance ? req.query?.day : undefined
      logs = await fetchClubCallLogsForClub(
        ctx,
        clubId,
        sinceRaw ?? (wantGlance ? CALL_TODAY_LOOKBACK_DAYS : undefined),
        clientIdFilter,
        dayForLogs,
      )
      if (wantGlance) {
        const role = ctx.isSalesManager ? 'sales' : ctx.isSupervisor ? 'club' : 'admin'
        const clientsBase =
          role === 'sales' ? '/sales/clients' : role === 'club' ? '/club/clients' : '/admin/clients'
        let archivedClientIds = []
        const clientIds = [
          ...new Set((logs ?? []).map((r) => String(r.client_id ?? '').trim()).filter(Boolean)),
        ]
        if (clientIds.length) {
          try {
            const { data: clients } = await ctx.supabaseAdmin
              .from('clients')
              .select('id, archived_at')
              .in('id', clientIds)
            archivedClientIds = (clients ?? [])
              .filter((c) => c?.archived_at)
              .map((c) => String(c.id))
          } catch {
            archivedClientIds = []
          }
        }
        glance = buildCallTodayGlance(logs, {
          clubId,
          clientsBasePath: clientsBase,
          maxItems: CALL_TODAY_MAX_ITEMS,
          archivedClientIds,
        })
      }
      if (!wantLogs) logs = undefined
    } catch (e) {
      if (wantLogs) {
        logs = []
        logs_error = String(e?.message ?? e).slice(0, 160)
      }
      if (wantGlance) {
        glance = { items: [], total: 0 }
        glance_error = String(e?.message ?? e).slice(0, 160)
      }
    }
  }

  sendJson(res, 200, {
    ok: true,
    configured: mzPublic.configured,
    moizvonki: mzPublic,
    club_id: clubId || null,
    club_name: clubName,
    ...(clientIdFilter ? { client_id: clientIdFilter } : {}),
    ...(wantLogs ? { logs, logs_error: logs_error || undefined } : {}),
    ...(wantGlance ? { glance, glance_error: glance_error || undefined } : {}),
  })
}

/**
 * POST admin-data?action=club-call
 * body: { club_id, client_id } — звонок
 * body: { op: 'note', club_id, log_id, staff_note } — пометка к строке журнала
 * @param {object} ctx
 * @param {object} res
 * @param {object} body
 */
export async function handleClubCallPost(ctx, res, body) {
  const op = String(body?.op ?? '').trim().toLowerCase()
  if (op === 'note') {
    return handleClubCallStaffNotePost(ctx, res, body)
  }

  const clubId = String(body?.club_id ?? '').trim()
  const clientId = String(body?.client_id ?? '').trim()
  if (!clubId || !clientId) {
    sendJson(res, 400, { ok: false, error: 'Нужны club_id и client_id', code: 'bad_request' })
    return
  }

  const mzCfg = await loadClubMoiZvonkiResolved(ctx, clubId)
  if (!isMoiZvonkiConfigReady(mzCfg)) {
    sendJson(res, 503, {
      ok: false,
      error:
        'Мои Звонки не настроены для этого клуба. Админ: Структура → Max и SMS → блок «Мои Звонки», либо MOIZVONKI_* в env.',
      code: 'not_configured',
    })
    return
  }

  const rate = checkClubCallRateLimit(`club-call:${clubId}`)
  if (!rate.ok) {
    sendJson(res, 429, {
      ok: false,
      error: `Слишком много звонков. Подождите ~${rate.retry_after_sec} с.`,
      code: rate.error,
      retry_after_sec: rate.retry_after_sec,
    })
    return
  }

  const { data: client, error: clientErr } = await ctx.supabaseAdmin
    .from('clients')
    .select('id, name, phone, club_id')
    .eq('id', clientId)
    .maybeSingle()

  if (clientErr) {
    sendJson(res, 500, {
      ok: false,
      error: 'Не удалось загрузить клиента',
      code: 'db_error',
      detail: String(clientErr.message ?? '').slice(0, 160) || undefined,
    })
    return
  }
  if (!client || String(client.club_id ?? '') !== clubId) {
    sendJson(res, 404, { ok: false, error: 'Клиент не найден в этом клубе', code: 'not_found' })
    return
  }

  const sentBy = ctx?.user?.id ?? null
  const phoneNorm = normalizeMoiZvonkiPhone(client.phone)

  /** @param {string} errorMsg */
  const logFail = async (errorMsg) => {
    try {
      await insertClubCallLogRow(ctx, {
        club_id: clubId,
        client_id: clientId,
        sent_by: sentBy,
        phone: phoneNorm || String(client.phone ?? ''),
        status: 'fail',
        error_message: errorMsg,
      })
    } catch {
      /* журнал не должен ломать ответ */
    }
  }

  if (!isValidMoiZvonkiPhone(client.phone)) {
    const err = 'У клиента нет корректного номера телефона'
    await logFail(err)
    sendJson(res, 400, { ok: false, error: err, code: 'no_phone' })
    return
  }

  const result = await sendMoiZvonkiCall({ to: client.phone, config: mzCfg })
  if (!result.ok) {
    const status =
      result.code === 'not_configured' ? 503 : result.code === 'bad_phone' ? 400 : 502
    await logFail(result.error || 'Не удалось запустить звонок')
    sendJson(res, status, { ok: false, error: result.error, code: result.code ?? 'call_failed' })
    return
  }

  const inserted = await insertClubCallLogRow(ctx, {
    club_id: clubId,
    client_id: clientId,
    sent_by: sentBy,
    phone: result.phone,
    status: 'ok',
  })

  sendJson(res, 200, {
    ok: true,
    phone: result.phone,
    log_id: inserted.log_id,
    moizvonki_source: mzCfg.source,
    ...(inserted.log_warning ? { log_warning: inserted.log_warning } : {}),
  })
}

/**
 * Пометка сотрудника к строке club_call_log.
 * @param {object} ctx
 * @param {object} res
 * @param {object} body
 */
export async function handleClubCallStaffNotePost(ctx, res, body) {
  const built = buildClubCallStaffNotePatch({
    club_id: body?.club_id,
    log_id: body?.log_id,
    staff_note: body?.staff_note,
    staff_note_chip_id: body?.staff_note_chip_id,
    callback_on: body?.callback_on,
    staff_note_by: ctx?.user?.id ?? null,
  })
  if (!built.ok) {
    sendJson(res, 400, { ok: false, error: built.error, code: 'bad_request' })
    return
  }

  const { data: existing, error: loadErr } = await ctx.supabaseAdmin
    .from('club_call_log')
    .select('id, club_id')
    .eq('id', built.log_id)
    .maybeSingle()

  if (loadErr) {
    sendJson(res, 500, {
      ok: false,
      error: 'Не удалось найти запись звонка',
      code: 'db_error',
      detail: String(loadErr.message ?? '').slice(0, 160) || undefined,
    })
    return
  }
  if (!existing || String(existing.club_id) !== built.club_id) {
    sendJson(res, 404, { ok: false, error: 'Запись звонка не найдена в этом клубе', code: 'not_found' })
    return
  }

  const { data: updated, error: updErr } = await ctx.supabaseAdmin
    .from('club_call_log')
    .update(built.patch)
    .eq('id', built.log_id)
    .eq('club_id', built.club_id)
    .select(
      'id, club_id, client_id, sent_by, phone, status, error_message, created_at, outcome, answered, duration_sec, mz_db_call_id, src_number, finished_at, recording_url, staff_note, staff_note_at, staff_note_by, staff_note_chip_id, callback_on',
    )
    .maybeSingle()

  if (updErr) {
    const msg = String(updErr.message ?? '')
    if (/staff_note|callback_on|schema cache|column/i.test(msg)) {
      sendJson(res, 503, {
        ok: false,
        error: 'Нужна миграция club_call_log (staff_note / funnel chips) на Supabase',
        code: 'migration_required',
      })
      return
    }
    sendJson(res, 500, {
      ok: false,
      error: 'Не удалось сохранить пометку',
      code: 'db_error',
      detail: msg.slice(0, 160) || undefined,
    })
    return
  }

  sendJson(res, 200, {
    ok: true,
    log: shapeClubCallLogApiRow(updated),
  })
}

