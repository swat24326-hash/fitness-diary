/**
 * Объединённый GET API админки/тренера (лимит Vercel Hobby: 12 functions).
 * ?action=search|journal|club-stats|health-cards|challenges|challenge-trainings|exercises|clubs
 */
import { requireAdmin, requireAdminOrSalesManager, requireAuthUser, sendJson, setCors } from './_lib/adminSupabase.js'
import { withSafeApiHandler } from './_lib/safeApiHandler.js'
import { assertSalesPlanScopeForRole } from '../src/lib/admin/salesAccessCore.js'
import { canViewClubDispatchSent } from '../src/lib/admin/iskraDispatchAccessCore.js'
import { handleGeminiAnalyticsPost, handleGeminiAnalyticsPrefetchGet } from './_lib/geminiAnalyticsHandler.js'
import { handleIskraSettingsGet, handleIskraSettingsPost } from './_lib/iskraSettingsHandler.js'
import {
  handleCoachQualitySettingsGet,
  handleCoachQualitySettingsPost,
} from './_lib/coachQualitySettingsHandler.js'
import { handleIskraLearningGet, handleIskraLearningPost } from './_lib/iskraLearningHandler.js'
import { handleIskraDispatchGet, handleIskraDispatchPost } from './_lib/iskraDispatchHandler.js'
import { handleIskraTtsPost } from './_lib/iskraTtsHandler.js'
import { handlePushSubscriptionGet, handlePushSubscriptionPost } from './_lib/pushSubscriptionHandler.js'
import { handleResetTrainerPasswordPost, handleSetTrainerActivePost } from './_lib/trainerAuthAdmin.js'
import { handleTrainerSelfStatsGet } from './_lib/adminData/trainerSelfStatsHandler.js'
import { handleSearch, handleJournal, handleClientsLastTrainings } from './_lib/adminData/journalHandlers.js'
import { handleClubStats, handleHealthCards, handleClubMonthly } from './_lib/adminData/clubHandlers.js'
import {
  handleChallenges,
  handleChallengeTrainings,
  handleClubs,
  handleMembershipTypes,
  handleNutritionProducts,
  handleHomeworkPresets,
  handleExercisesMeta,
  handleExercises,
} from './_lib/adminData/referenceHandlers.js'
import {
  parseJsonBody,
  handleSalesGet,
  handleSalesDailyPost,
  handleSalesPlanPost,
  handleSalesFinancePost,
  handleCreateSalesManagerPost,
} from './_lib/adminData/salesHandlers.js'
import { handlePnk } from './_lib/adminData/pnkHandlers.js'
import { handleClubSmsGet, handleClubSmsPost } from './_lib/moiZvonkiHandler.js'

async function handler(req, res) {
  setCors(res, 'GET, POST, OPTIONS')
  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }

  const action = String(req.query?.action ?? '').trim().toLowerCase()

  if (req.method === 'POST') {
    const postActions = new Set([
      'sales-daily',
      'sales-plan',
      'sales-finance',
      'gemini-analytics',
      'create-sales-manager',
      'iskra-settings',
      'coach-quality-settings',
      'iskra-learning',
      'iskra-dispatch',
      'iskra-tts',
      'push-subscription',
      'reset-trainer-password',
      'set-trainer-active',
      'pnk',
      'club-sms',
    ])
    if (!postActions.has(action)) {
      sendJson(res, 405, { error: 'Method not allowed' })
      return
    }
    const body = parseJsonBody(req)
    if (!body) {
      sendJson(res, 400, { error: 'Invalid JSON' })
      return
    }
    if (action === 'club-sms') {
      const clubId = String(body?.club_id ?? '').trim()
      const ctx = await requireAdminOrSalesManager(req, res, clubId)
      if (!ctx) return
      return handleClubSmsPost(ctx, res, body)
    }
    if (action === 'gemini-analytics') {
      const ctx = await requireAdmin(req, res)
      if (!ctx) return
      return handleGeminiAnalyticsPost(ctx, req, res, body)
    }
    if (action === 'iskra-tts') {
      const ctx = await requireAdmin(req, res)
      if (!ctx) return
      return handleIskraTtsPost(ctx, res, body)
    }
    if (action === 'sales-finance') {
      const ctx = await requireAdmin(req, res)
      if (!ctx) return
      return handleSalesFinancePost(ctx, req, res, body)
    }
    if (action === 'create-sales-manager') {
      const ctx = await requireAdmin(req, res)
      if (!ctx) return
      return handleCreateSalesManagerPost(ctx, res, body)
    }
    if (action === 'iskra-settings') {
      const ctx = await requireAdmin(req, res)
      if (!ctx) return
      return handleIskraSettingsPost(ctx, res, body)
    }
    if (action === 'coach-quality-settings') {
      const ctx = await requireAdmin(req, res)
      if (!ctx) return
      return handleCoachQualitySettingsPost(ctx, res, body)
    }
    if (action === 'iskra-learning') {
      const ctx = await requireAdmin(req, res)
      if (!ctx) return
      return handleIskraLearningPost(ctx, res, body)
    }
    if (action === 'iskra-dispatch') {
      const op = String(body?.op ?? 'create').trim().toLowerCase()
      if (op === 'update_status' || op === 'mark_seen' || op === 'complete_stage') {
        const ctx = await requireAuthUser(req, res)
        if (!ctx) return
        return handleIskraDispatchPost(ctx, res, body)
      }
      if (op === 'delete' || op === 'stop_recurrence') {
        const clubId = String(body?.club_id ?? '').trim()
        if (op === 'delete') {
          const ctx = await requireAdmin(req, res)
          if (!ctx) return
          return handleIskraDispatchPost(ctx, res, body)
        }
        const ctx = await requireAdminOrSalesManager(req, res, clubId)
        if (!ctx) return
        return handleIskraDispatchPost(ctx, res, body)
      }
      const clubId = String(body?.club_id ?? '').trim()
      const ctx = await requireAdminOrSalesManager(req, res, clubId)
      if (!ctx) return
      return handleIskraDispatchPost(ctx, res, body)
    }
    if (action === 'push-subscription') {
      const ctx = await requireAuthUser(req, res)
      if (!ctx) return
      return handlePushSubscriptionPost(ctx, res, body)
    }
    if (action === 'reset-trainer-password') {
      const ctx = await requireAdmin(req, res)
      if (!ctx) return
      return handleResetTrainerPasswordPost(ctx, res, body)
    }
    if (action === 'set-trainer-active') {
      const ctx = await requireAdmin(req, res)
      if (!ctx) return
      return handleSetTrainerActivePost(ctx, res, body)
    }
    const clubId = String(body?.club_id ?? '').trim()
    const ctx = await requireAdminOrSalesManager(req, res, clubId)
    if (!ctx) return
    if (action === 'pnk') return handlePnk(ctx, req, res)
    if (action === 'sales-daily') return handleSalesDailyPost(ctx, req, res, body)
    if (action === 'sales-plan') {
      const scope =
        body?.scope === 'levels' || body?.scope === 'directions' ? body.scope : 'all'
      const scopeCheck = assertSalesPlanScopeForRole(scope, ctx.isSalesManager === true)
      if (!scopeCheck.ok) {
        sendJson(res, 403, { error: scopeCheck.error })
        return
      }
      return handleSalesPlanPost(ctx, req, res, body)
    }
  }

  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed' })
    return
  }
  const trainerActions = new Set([
    'challenges',
    'challenge-trainings',
    'exercises',
    'exercises-meta',
    'membership-types',
    'nutrition-products',
    'homework-presets',
    'iskra-dispatch',
    'push-subscription',
    'trainer-self-stats',
  ])

  if (trainerActions.has(action)) {
    const authCtx = await requireAuthUser(req, res)
    if (!authCtx) return
    if (action === 'trainer-self-stats') {
      if (!authCtx.isAdmin && !authCtx.isTrainer) {
        sendJson(res, 403, { error: 'Нет доступа' })
        return
      }
      return handleTrainerSelfStatsGet(authCtx, req, res)
    }
    if (action === 'iskra-dispatch') {
      const view = String(req.query?.view ?? 'inbox').trim().toLowerCase()
      if (view === 'sent') {
        if (!canViewClubDispatchSent(authCtx)) {
          sendJson(res, 403, { error: 'Нет доступа к списку заданий' })
          return
        }
      } else if (!authCtx.isAdmin && !authCtx.isTrainer && !authCtx.isSalesManager) {
        sendJson(res, 403, { error: 'Нет доступа' })
        return
      }
      return handleIskraDispatchGet(authCtx, req, res)
    }
    // VAPID public key + своя подписка: тренер, админ и менеджер продаж
    if (action === 'push-subscription') {
      if (!authCtx.isAdmin && !authCtx.isTrainer && !authCtx.isSalesManager) {
        sendJson(res, 403, { error: 'Нет доступа' })
        return
      }
      return handlePushSubscriptionGet(authCtx, res)
    }
    if (!authCtx.isAdmin && !authCtx.isTrainer) {
      sendJson(res, 403, { error: 'Нет доступа' })
      return
    }
    if (action === 'challenges') return handleChallenges(authCtx, req, res)
    if (action === 'challenge-trainings') return handleChallengeTrainings(authCtx, req, res)
    if (action === 'exercises-meta') return handleExercisesMeta(authCtx, res)
    if (action === 'exercises') return handleExercises(authCtx, res)
    if (action === 'membership-types') return handleMembershipTypes(authCtx, req, res)
    if (action === 'nutrition-products') return handleNutritionProducts(authCtx, req, res)
    if (action === 'homework-presets') return handleHomeworkPresets(authCtx, req, res)
  }

  if (action === 'sales') {
    const clubId = String(req.query?.club_id ?? '').trim()
    const ctx = await requireAdminOrSalesManager(req, res, clubId)
    if (!ctx) return
    return handleSalesGet(ctx, req, res)
  }

  if (action === 'pnk') {
    const clubId = String(req.query?.club_id ?? '').trim()
    const ctx = await requireAdminOrSalesManager(req, res, clubId)
    if (!ctx) return
    return handlePnk(ctx, req, res)
  }

  if (action === 'club-sms') {
    const clubId = String(req.query?.club_id ?? '').trim()
    const ctx = await requireAdminOrSalesManager(req, res, clubId)
    if (!ctx) return
    return handleClubSmsGet(ctx, req, res)
  }

  /** Настройки качества ведения: чтение — админ или сотрудник своего клуба; запись — только админ (POST). */
  if (action === 'coach-quality-settings') {
    const clubId = String(req.query?.club_id ?? '').trim()
    const authCtx = await requireAuthUser(req, res)
    if (!authCtx) return
    if (authCtx.isAdmin) {
      return handleCoachQualitySettingsGet(authCtx, req, res)
    }
    const userClub = String(authCtx.profile?.club_id ?? '').trim()
    if ((authCtx.isTrainer || authCtx.isSalesManager) && clubId && userClub === clubId) {
      return handleCoachQualitySettingsGet(authCtx, req, res)
    }
    sendJson(res, 403, { error: 'Нет доступа к настройкам качества этого клуба' })
    return
  }

  const ctx = await requireAdmin(req, res)
  if (!ctx) return

  switch (action) {
    case 'search':
      return handleSearch(ctx, req, res)
    case 'journal':
      return handleJournal(ctx, req, res)
    case 'clients-last-trainings':
      return handleClientsLastTrainings(ctx, req, res)
    case 'club-stats':
      return handleClubStats(ctx, req, res)
    case 'club-monthly':
      return handleClubMonthly(ctx, req, res)
    case 'health-cards':
      return handleHealthCards(ctx, req, res)
    case 'clubs':
      return handleClubs(ctx, res)
    case 'gemini-analytics-prefetch':
      return handleGeminiAnalyticsPrefetchGet(ctx, req, res)
    case 'iskra-settings':
      return handleIskraSettingsGet(ctx, req, res)
    case 'iskra-learning':
      return handleIskraLearningGet(ctx, req, res)
    case 'iskra-dispatch':
      return handleIskraDispatchGet(ctx, req, res)
    default:
      sendJson(res, 400, {
        error:
          'Укажите action: search, journal, clients-last-trainings, club-stats, club-monthly, health-cards, sales, gemini-analytics-prefetch, iskra-settings, challenges, challenge-trainings, exercises, membership-types, clubs',
      })
  }
}

export default withSafeApiHandler(handler, { label: 'admin-data' })
