import { sendJson } from './adminSupabase.js'
import {
  buildClubSmsLogInsertRow,
  clampClubSmsLogSinceDays,
  CLUB_SMS_LOG_MAX_ROWS,
  clubSmsLogSinceIso,
  shapeClubSmsLogApiRow,
} from '../../src/lib/admin/clubSmsLogCore.js'
import {
  getMoiZvonkiConfigFromEnv,
  checkClubSmsRateLimit,
  isMoiZvonkiConfigReady,
  isValidMoiZvonkiPhone,
  sendMoiZvonkiSms,
} from './moiZvonkiCore.js'
import {
  resolveMoiZvonkiConfig,
  shapeMoiZvonkiPublicStatus,
} from '../../src/lib/admin/moiZvonkiClubConfigCore.js'
import {
  OUTREACH_SCENARIOS,
  buildOutreachMessage,
  clientMatchesOutreachFilter,
  isOutreachScenario,
} from '../../src/lib/trainer/trainerClientOutreachCore.js'
import { resolveClubSmsTemplates } from '../../src/lib/admin/clubSmsTemplatesCore.js'
import { resolveClientClubSmsScenario } from '../../src/lib/admin/clubSmsSentMarkCore.js'
import { pickUsableMembershipForDate } from '../../src/lib/membershipRules.js'
import { todayLocalIso } from '../../src/lib/dateRu.js'

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
        .select('moizvonki, club_sms_templates')
        .eq('club_id', clubId)
        .maybeSingle()
      clubStored = data?.moizvonki ?? null
      return {
        resolved: resolveMoiZvonkiConfig({
          clubStored,
          envConfig: getMoiZvonkiConfigFromEnv(),
        }),
        clubSmsTemplates: data?.club_sms_templates ?? null,
      }
    } catch {
      /* fall through */
    }
  }
  return {
    resolved: resolveMoiZvonkiConfig({
      clubStored: null,
      envConfig: getMoiZvonkiConfigFromEnv(),
    }),
    clubSmsTemplates: null,
  }
}

/**
 * GET admin-data?action=club-sms&club_id=
 * Опционально: &logs=1&since_days=14 — облачный журнал.
 * @param {object} ctx
 * @param {object} req
 * @param {object} res
 */
export async function handleClubSmsGet(ctx, req, res) {
  const clubId = String(req.query?.club_id ?? '').trim()
  const wantLogs =
    String(req.query?.logs ?? '') === '1' ||
    String(req.query?.logs ?? '').toLowerCase() === 'true'
  let templates = resolveClubSmsTemplates(null)
  let clubName = ''
  let mzPublic = shapeMoiZvonkiPublicStatus(
    resolveMoiZvonkiConfig({ envConfig: getMoiZvonkiConfigFromEnv() }),
  )

  if (clubId && ctx?.supabaseAdmin) {
    try {
      const [{ data: settings }, { data: club }] = await Promise.all([
        ctx.supabaseAdmin
          .from('club_iskra_settings')
          .select('club_sms_templates, moizvonki')
          .eq('club_id', clubId)
          .maybeSingle(),
        ctx.supabaseAdmin.from('clubs').select('name').eq('id', clubId).maybeSingle(),
      ])
      templates = resolveClubSmsTemplates(settings?.club_sms_templates ?? null)
      clubName = String(club?.name ?? '').trim()
      const resolved = resolveMoiZvonkiConfig({
        clubStored: settings?.moizvonki ?? null,
        envConfig: getMoiZvonkiConfigFromEnv(),
      })
      mzPublic = shapeMoiZvonkiPublicStatus(resolved)
    } catch {
      templates = resolveClubSmsTemplates(null)
    }
  }

  /** @type {object[] | undefined} */
  let logs
  let logs_error
  if (wantLogs && clubId && ctx?.supabaseAdmin) {
    try {
      logs = await fetchClubSmsLogsForClub(ctx, clubId, req.query?.since_days)
    } catch (e) {
      logs = []
      logs_error = String(e?.message ?? e).slice(0, 160)
    }
  }

  sendJson(res, 200, {
    ok: true,
    configured: mzPublic.configured,
    moizvonki: mzPublic,
    scenarios: [...OUTREACH_SCENARIOS],
    club_id: clubId || null,
    club_name: clubName,
    templates,
    ...(wantLogs ? { logs, logs_error: logs_error || undefined } : {}),
  })
}

/**
 * @param {object} ctx
 * @param {string} clubId
 * @param {unknown} sinceDaysRaw
 */
async function fetchClubSmsLogsForClub(ctx, clubId, sinceDaysRaw) {
  const sinceDays = clampClubSmsLogSinceDays(sinceDaysRaw)
  const sinceIso = clubSmsLogSinceIso(todayLocalIso(), sinceDays)

  const { data: rows, error } = await ctx.supabaseAdmin
    .from('club_sms_log')
    .select('id, club_id, client_id, sent_by, scenario, message_preview, status, error_message, created_at')
    .eq('club_id', clubId)
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(CLUB_SMS_LOG_MAX_ROWS)

  if (error) throw new Error(error.message || 'club_sms_log query failed')

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
      shapeClubSmsLogApiRow(row, {
        clientName: clientNames[String(row.client_id)],
        sentByName: row.sent_by ? senderNames[String(row.sent_by)] : null,
      }),
    )
    .filter(Boolean)
}

/**
 * @param {object} ctx
 * @param {Parameters<typeof buildClubSmsLogInsertRow>[0]} input
 * @returns {Promise<{ log_id: string | null, log_warning?: string }>}
 */
async function insertClubSmsLogRow(ctx, input) {
  const built = buildClubSmsLogInsertRow(input)
  if (!built.ok) return { log_id: null, log_warning: built.error }
  const { data: inserted, error: insertErr } = await ctx.supabaseAdmin
    .from('club_sms_log')
    .insert(built.row)
    .select('id')
    .maybeSingle()
  if (insertErr) {
    return {
      log_id: null,
      log_warning: String(insertErr.message ?? 'journal_insert_failed').slice(0, 160),
    }
  }
  return { log_id: inserted?.id ? String(inserted.id) : null }
}

/**
 * POST admin-data?action=club-sms
 * body: { club_id, client_id, scenario?: 'expiring'|..., text?: string }
 * @param {object} ctx
 * @param {object} res
 * @param {object} body
 */
export async function handleClubSmsPost(ctx, res, body) {
  const clubId = String(body?.club_id ?? '').trim()
  const clientId = String(body?.client_id ?? '').trim()
  if (!clubId || !clientId) {
    sendJson(res, 400, { ok: false, error: 'Нужны club_id и client_id', code: 'bad_request' })
    return
  }

  const { resolved: mzCfg } = await loadClubMoiZvonkiResolved(ctx, clubId)
  if (!isMoiZvonkiConfigReady(mzCfg)) {
    sendJson(res, 503, {
      ok: false,
      error:
        'Мои Звонки не настроены для этого клуба. Админ: Структура → Max и SMS → блок «Мои Звонки», либо MOIZVONKI_* в env.',
      code: 'not_configured',
    })
    return
  }

  const rate = checkClubSmsRateLimit(`club:${clubId}`)
  if (!rate.ok) {
    sendJson(res, 429, {
      ok: false,
      error: `Слишком много SMS. Подождите ~${rate.retry_after_sec} с.`,
      code: rate.error,
      retry_after_sec: rate.retry_after_sec,
    })
    return
  }

  const { data: client, error: clientErr } = await ctx.supabaseAdmin
    .from('clients')
    .select('id, name, phone, outreach_name, club_id, trainer_id, archived_at, birth_date')
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

  const customText = String(body?.text ?? '').trim()
  let scenarioHint = String(body?.scenario ?? '').trim().toLowerCase()
  const sentBy = ctx?.user?.id ?? null

  /** @param {string} errorMsg @param {string} [preview] @param {string} [scenario] */
  const logFail = async (errorMsg, preview = customText, scenario = scenarioHint) => {
    try {
      await insertClubSmsLogRow(ctx, {
        club_id: clubId,
        client_id: clientId,
        sent_by: sentBy,
        scenario: isOutreachScenario(scenario) ? scenario : 'custom',
        message_preview: preview || errorMsg,
        status: 'fail',
        error_message: errorMsg,
      })
    } catch {
      /* журнал не должен ломать ответ об ошибке */
    }
  }

  if (!isValidMoiZvonkiPhone(client.phone)) {
    const err = 'У клиента нет корректного номера телефона'
    await logFail(err)
    sendJson(res, 400, { ok: false, error: err, code: 'no_phone' })
    return
  }

  let text = customText
  let scenario = scenarioHint
  /** @type {object[] | null} */
  let memListForLog = null

  if (!text) {
    if (!isOutreachScenario(scenario)) {
      const err =
        'Укажите текст SMS или выберите фильтр со сценарием (например «Истекает ≤ 5 дней»)'
      await logFail(err)
      sendJson(res, 400, {
        ok: false,
        error: err,
        code: 'need_text_or_scenario',
      })
      return
    }

    const today = todayLocalIso()
    const [memRes, clubRes, settingsRes, trainerRes] = await Promise.all([
      ctx.supabaseAdmin
        .from('memberships')
        .select('id, client_id, membership_type_id, start_date, end_date, total_trainings, used_trainings')
        .eq('client_id', clientId),
      ctx.supabaseAdmin.from('clubs').select('id, name').eq('id', clubId).maybeSingle(),
      ctx.supabaseAdmin
        .from('club_iskra_settings')
        .select('club_sms_templates')
        .eq('club_id', clubId)
        .maybeSingle(),
      client.trainer_id
        ? ctx.supabaseAdmin.from('users').select('id, name').eq('id', client.trainer_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ])

    const memList = memRes.data ?? []
    memListForLog = memList
    const matches = clientMatchesOutreachFilter(scenario, {
      memList,
      today,
      birthDate: client.birth_date,
    })
    if (!matches) {
      const err = 'Клиент не подходит под этот сценарий — напишите свой текст SMS'
      await logFail(err, '', scenario)
      sendJson(res, 400, {
        ok: false,
        error: err,
        code: 'scenario_mismatch',
      })
      return
    }

    const active = pickUsableMembershipForDate(memList, today)
    let membershipName = 'абонемент'
    const typeId = active?.membership_type_id
    if (typeId) {
      const { data: typeRow } = await ctx.supabaseAdmin
        .from('membership_types')
        .select('id, name')
        .eq('id', typeId)
        .maybeSingle()
      if (typeRow?.name) membershipName = String(typeRow.name)
    }

    const templates = resolveClubSmsTemplates(settingsRes.data?.club_sms_templates ?? null)
    text = buildOutreachMessage(scenario, {
      client,
      memList,
      trainerName: trainerRes.data?.name || '',
      clubName: clubRes.data?.name || 'клуб',
      membershipName,
      today,
      templates,
    })
  }

  if (!text) {
    const err = 'Не удалось собрать текст SMS'
    await logFail(err)
    sendJson(res, 400, { ok: false, error: err, code: 'empty_text' })
    return
  }

  const result = await sendMoiZvonkiSms({ to: client.phone, text, config: mzCfg })
  if (!result.ok) {
    const status =
      result.code === 'not_configured' ? 503 : result.code === 'bad_phone' ? 400 : 502
    await logFail(result.error || 'Не удалось отправить SMS', text, scenario)
    sendJson(res, status, { ok: false, error: result.error, code: result.code ?? 'send_failed' })
    return
  }

  let logScenario = isOutreachScenario(scenario) ? scenario : 'custom'
  if (customText) {
    try {
      if (!memListForLog) {
        const { data: mems } = await ctx.supabaseAdmin
          .from('memberships')
          .select('id, client_id, membership_type_id, start_date, end_date, total_trainings, used_trainings')
          .eq('client_id', clientId)
        memListForLog = mems ?? []
      }
      logScenario = resolveClientClubSmsScenario({
        client,
        memList: memListForLog,
        today: todayLocalIso(),
      })
    } catch {
      logScenario = 'custom'
    }
  }

  const inserted = await insertClubSmsLogRow(ctx, {
    club_id: clubId,
    client_id: clientId,
    sent_by: sentBy,
    scenario: logScenario,
    message_preview: text,
    status: 'ok',
  })

  sendJson(res, 200, {
    ok: true,
    phone: result.phone,
    scenario: logScenario,
    preview: text.length > 80 ? `${text.slice(0, 79)}…` : text,
    log_id: inserted.log_id,
    moizvonki_source: mzCfg.source,
    ...(inserted.log_warning ? { log_warning: inserted.log_warning } : {}),
  })
}
