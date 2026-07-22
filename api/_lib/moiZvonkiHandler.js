import { sendJson } from './adminSupabase.js'
import {
  checkClubSmsRateLimit,
  isMoiZvonkiConfigured,
  isValidMoiZvonkiPhone,
  sendMoiZvonkiSms,
} from './moiZvonkiCore.js'
import {
  OUTREACH_SCENARIOS,
  buildOutreachMessage,
  clientMatchesOutreachFilter,
  isOutreachScenario,
} from '../../src/lib/trainer/trainerClientOutreachCore.js'
import { resolveClubSmsTemplates } from '../../src/lib/admin/clubSmsTemplatesCore.js'
import { pickUsableMembershipForDate } from '../../src/lib/membershipRules.js'
import { todayLocalIso } from '../../src/lib/dateRu.js'

/**
 * GET admin-data?action=club-sms&club_id=
 * @param {object} ctx
 * @param {object} req
 * @param {object} res
 */
export async function handleClubSmsGet(ctx, req, res) {
  const clubId = String(req.query?.club_id ?? '').trim()
  let templates = resolveClubSmsTemplates(null)
  let clubName = ''

  if (clubId && ctx?.supabaseAdmin) {
    try {
      const [{ data: settings }, { data: club }] = await Promise.all([
        ctx.supabaseAdmin
          .from('club_iskra_settings')
          .select('club_sms_templates')
          .eq('club_id', clubId)
          .maybeSingle(),
        ctx.supabaseAdmin.from('clubs').select('name').eq('id', clubId).maybeSingle(),
      ])
      templates = resolveClubSmsTemplates(settings?.club_sms_templates ?? null)
      clubName = String(club?.name ?? '').trim()
    } catch {
      templates = resolveClubSmsTemplates(null)
    }
  }

  sendJson(res, 200, {
    ok: true,
    configured: isMoiZvonkiConfigured(),
    scenarios: [...OUTREACH_SCENARIOS],
    club_id: clubId || null,
    club_name: clubName,
    templates,
  })
}

/**
 * POST admin-data?action=club-sms
 * body: { club_id, client_id, scenario?: 'expiring'|..., text?: string }
 * С text — произвольное SMS. Без text — club-шаблон + клиент подходит под фильтр.
 * @param {object} ctx
 * @param {object} res
 * @param {object} body
 */
export async function handleClubSmsPost(ctx, res, body) {
  if (!isMoiZvonkiConfigured()) {
    sendJson(res, 503, {
      ok: false,
      error: 'Мои Звонки не настроены на сервере. Администратору: MOIZVONKI_* в env (см. docs/MOIZVONKI_SETUP.md).',
      code: 'not_configured',
    })
    return
  }

  const clubId = String(body?.club_id ?? '').trim()
  const clientId = String(body?.client_id ?? '').trim()
  if (!clubId || !clientId) {
    sendJson(res, 400, { ok: false, error: 'Нужны club_id и client_id', code: 'bad_request' })
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
  if (!isValidMoiZvonkiPhone(client.phone)) {
    sendJson(res, 400, { ok: false, error: 'У клиента нет корректного номера телефона', code: 'no_phone' })
    return
  }

  const customText = String(body?.text ?? '').trim()
  let text = customText
  let scenario = String(body?.scenario ?? '').trim().toLowerCase()

  if (!text) {
    if (!isOutreachScenario(scenario)) {
      sendJson(res, 400, {
        ok: false,
        error: 'Укажите текст SMS или выберите фильтр со сценарием (например «Истекает ≤ 3 дня»)',
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
    const matches = clientMatchesOutreachFilter(scenario, {
      memList,
      today,
      birthDate: client.birth_date,
      isStale: false,
    })
    if (!matches) {
      sendJson(res, 400, {
        ok: false,
        error: 'Клиент не подходит под этот сценарий — напишите свой текст SMS',
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
    sendJson(res, 400, { ok: false, error: 'Не удалось собрать текст SMS', code: 'empty_text' })
    return
  }

  const result = await sendMoiZvonkiSms({ to: client.phone, text })
  if (!result.ok) {
    const status =
      result.code === 'not_configured' ? 503 : result.code === 'bad_phone' ? 400 : 502
    sendJson(res, status, { ok: false, error: result.error, code: result.code ?? 'send_failed' })
    return
  }

  sendJson(res, 200, {
    ok: true,
    phone: result.phone,
    scenario: customText ? null : scenario,
    preview: text.length > 80 ? `${text.slice(0, 79)}…` : text,
  })
}
