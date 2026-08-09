/**
 * GET admin-data?action=trainer-pay-payroll-context — live или снимок месяца.
 */
import { sendJson } from './adminSupabase.js'
import { loadTrainerPayrollContext } from './trainerPayrollContext.js'

/**
 * @param {object} ctx
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 */
export async function handleTrainerPayPayrollContextGet(ctx, req, res) {
  const clubId = String(req.query?.club_id ?? '').trim()
  const year = Number(req.query?.year)
  const month = Number(req.query?.month)
  if (!clubId) {
    sendJson(res, 400, { error: 'Укажите club_id' })
    return
  }
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    sendJson(res, 400, { error: 'Укажите year и month' })
    return
  }
  try {
    const payrollCtx = await loadTrainerPayrollContext(ctx.supabaseAdmin, clubId, { year, month })
    const profiles = []
    if (payrollCtx.profilesByTrainerId instanceof Map) {
      for (const p of payrollCtx.profilesByTrainerId.values()) profiles.push(p)
    }
    sendJson(res, 200, {
      ok: true,
      club_id: clubId,
      year,
      month,
      frozen: Boolean(payrollCtx.frozen),
      frozen_at: payrollCtx.frozen_at ?? null,
      migration_needed: Boolean(payrollCtx.migration_needed),
      planConfig: payrollCtx.planConfig,
      profiles,
      membershipTypes: payrollCtx.membershipTypes ?? [],
    })
  } catch (e) {
    sendJson(res, 400, { error: e?.message ? String(e.message) : 'Ошибка контекста ЗП' })
  }
}
