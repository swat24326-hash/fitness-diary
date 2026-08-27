/**
 * Объединённый GET API админки/тренера (лимит Vercel Hobby: 12 functions).
 * ?action=search|journal|club-stats|health-cards|challenges|challenge-trainings|exercises|clubs
 */
import { requireAdmin, requireAdminOrSalesManager, requireAdminOrSupervisor, requireAuthUser, sendJson, setCors } from './_lib/adminSupabase.js'
import { withSafeApiHandler } from './_lib/safeApiHandler.js'
import { assertSalesPlanScopeForRole } from '../src/lib/admin/salesAccessCore.js'
import { canViewClubDispatchSent } from '../src/lib/admin/iskraDispatchAccessCore.js'
import { handleGeminiAnalyticsPost, handleGeminiAnalyticsPrefetchGet } from './_lib/geminiAnalyticsHandler.js'
import { handleIskraSettingsGet, handleIskraSettingsPost } from './_lib/iskraSettingsHandler.js'
import {
  handleCoachQualitySettingsGet,
  handleCoachQualitySettingsPost,
} from './_lib/coachQualitySettingsHandler.js'
import {
  handleTrainerPayPlanSettingsGet,
  handleTrainerPayPlanSettingsPost,
} from './_lib/trainerPayPlanSettingsHandler.js'
import {
  handleTrainerPayProfilesGet,
  handleTrainerPayProfilesPost,
} from './_lib/trainerPayProfileSettingsHandler.js'
import { handleTrainerPayPayrollContextGet } from './_lib/trainerPayPayrollContextHandler.js'
import { handleIskraLearningGet, handleIskraLearningPost } from './_lib/iskraLearningHandler.js'
import { handleIskraDispatchGet, handleIskraDispatchPost } from './_lib/iskraDispatchHandler.js'
import { handleIskraTtsPost } from './_lib/iskraTtsHandler.js'
import { handlePushSubscriptionGet, handlePushSubscriptionPost } from './_lib/pushSubscriptionHandler.js'
import {
  handleResetTrainerPasswordPost,
  handleSetTrainerActivePost,
  handleSetTrainerNamePost,
  handleSetTrainerUsesTabletPost,
  handleDeleteTrainerPost,
} from './_lib/trainerAuthAdmin.js'
import { handleTrainerSelfStatsGet } from './_lib/adminData/trainerSelfStatsHandler.js'
import { handleTrainerSelfJournalGet } from './_lib/adminData/trainerSelfJournalHandler.js'
import { handleTrainerScheduleGet } from './_lib/adminData/trainerScheduleHandler.js'
import { handleSearch, handleJournal, handleClientsLastTrainings } from './_lib/adminData/journalHandlers.js'
import { handleDeletionAuditLogGet } from './_lib/adminData/deletionAuditLogHandler.js'
import { handleClubStats, handleCoachQuality, handleClientRetention, handleClientAttendance, handleHealthCards, handleClubMonthly } from './_lib/adminData/clubHandlers.js'
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
import { handleCreateSupervisorPost } from './_lib/adminData/supervisorHandlers.js'
import { handlePriceListGet, handlePriceListPost } from './_lib/adminData/priceListHandlers.js'
import { handleTzPriceListGet, handleTzPriceListPost } from './_lib/adminData/tzPriceListHandlers.js'
import { handleAzPriceListGet, handleAzPriceListPost } from './_lib/adminData/azPriceListHandlers.js'
import { handlePnk } from './_lib/adminData/pnkHandlers.js'
import { handleClubSmsGet, handleClubSmsPost } from './_lib/moiZvonkiHandler.js'
import { handleClubCallGet, handleClubCallPost } from './_lib/moiZvonkiCallHandler.js'
import { handleMoiZvonkiWebhookPost } from './_lib/moiZvonkiWebhookHandler.js'
import { handleSaleClipsGet, handleSaleClipsPost } from './_lib/adminData/saleClipsHandlers.js'
import {
  handleLoyaltyAccountGet,
  handleLoyaltyGlanceGet,
  handleLoyaltyJournalGet,
  handleLoyaltyRedeemPost,
  handleLoyaltySettingsGet,
  handleLoyaltySettingsPost,
} from './_lib/adminData/loyaltyHandlers.js'

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
      'create-supervisor',
      'iskra-settings',
      'coach-quality-settings',
      'trainer-pay-plan-settings',
      'trainer-pay-profiles',
      'trainer-pay-payroll-context',
      'iskra-learning',
      'iskra-dispatch',
      'iskra-tts',
      'push-subscription',
      'reset-trainer-password',
      'set-trainer-active',
      'set-trainer-name',
      'set-trainer-uses-tablet',
      'delete-trainer',
      'pnk',
      'sale-clips',
      'club-sms',
      'club-call',
      'moizvonki-webhook',
      'price-list',
      'tz-price-list',
      'az-price-list',
      'loyalty-settings',
      'loyalty-redeem',
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
    if (action === 'moizvonki-webhook') {
      return handleMoiZvonkiWebhookPost(req, res, body)
    }
    if (action === 'club-sms') {
      const clubId = String(body?.club_id ?? '').trim()
      const ctx = await requireAdminOrSalesManager(req, res, clubId)
      if (!ctx) return
      return handleClubSmsPost(ctx, res, body)
    }
    if (action === 'club-call') {
      const clubId = String(body?.club_id ?? '').trim()
      const ctx = await requireAdminOrSalesManager(req, res, clubId)
      if (!ctx) return
      return handleClubCallPost(ctx, res, body)
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
      const clubId = String(body?.club_id ?? '').trim()
      const ctx = await requireAdminOrSupervisor(req, res, clubId)
      if (!ctx) return
      return handleSalesFinancePost(ctx, req, res, body)
    }
    if (action === 'create-sales-manager') {
      const ctx = await requireAdmin(req, res)
      if (!ctx) return
      return handleCreateSalesManagerPost(ctx, res, body)
    }
    if (action === 'create-supervisor') {
      const ctx = await requireAdmin(req, res)
      if (!ctx) return
      return handleCreateSupervisorPost(ctx, res, body)
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
    if (action === 'trainer-pay-plan-settings') {
      const ctx = await requireAdmin(req, res)
      if (!ctx) return
      return handleTrainerPayPlanSettingsPost(ctx, res, body)
    }
    if (action === 'trainer-pay-profiles') {
      const ctx = await requireAdmin(req, res)
      if (!ctx) return
      return handleTrainerPayProfilesPost(ctx, res, body)
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
    if (action === 'set-trainer-name') {
      const ctx = await requireAdmin(req, res)
      if (!ctx) return
      return handleSetTrainerNamePost(ctx, res, body)
    }
    if (action === 'set-trainer-uses-tablet') {
      const ctx = await requireAdmin(req, res)
      if (!ctx) return
      return handleSetTrainerUsesTabletPost(ctx, res, body)
    }
    if (action === 'delete-trainer') {
      const ctx = await requireAdmin(req, res)
      if (!ctx) return
      return handleDeleteTrainerPost(ctx, res, body)
    }
    if (action === 'price-list') {
      const clubId = String(body?.club_id ?? '').trim()
      const ctx = await requireAdminOrSalesManager(req, res, clubId)
      if (!ctx) return
      return handlePriceListPost(ctx, req, res, body)
    }
    if (action === 'tz-price-list') {
      const clubId = String(body?.club_id ?? '').trim()
      const ctx = await requireAdminOrSalesManager(req, res, clubId)
      if (!ctx) return
      return handleTzPriceListPost(ctx, req, res, body)
    }
    if (action === 'az-price-list') {
      const clubId = String(body?.club_id ?? '').trim()
      const ctx = await requireAdminOrSalesManager(req, res, clubId)
      if (!ctx) return
      return handleAzPriceListPost(ctx, req, res, body)
    }
    if (action === 'loyalty-settings') {
      const ctx = await requireAuthUser(req, res)
      if (!ctx) return
      return handleLoyaltySettingsPost(ctx, req, res, body)
    }
    if (action === 'loyalty-redeem') {
      const ctx = await requireAuthUser(req, res)
      if (!ctx) return
      return handleLoyaltyRedeemPost(ctx, req, res, body)
    }
    const clubId = String(body?.club_id ?? '').trim()
    const ctx = await requireAdminOrSalesManager(req, res, clubId)
    if (!ctx) return
    if (action === 'pnk') return handlePnk(ctx, req, res)
    if (action === 'sale-clips') return handleSaleClipsPost(ctx, req, res)
    if (action === 'sales-daily') return handleSalesDailyPost(ctx, req, res, body)
    if (action === 'sales-plan') {
      const scope =
        body?.scope === 'levels' ||
        body?.scope === 'directions' ||
        body?.scope === 'strategy_snapshot' ||
        body?.scope === 'promotions'
          ? body.scope
          : 'all'
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
    'trainer-self-journal',
    'coach-quality',
    'client-retention',
    'client-attendance',
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
    if (action === 'trainer-self-journal') {
      if (!authCtx.isAdmin && !authCtx.isTrainer) {
        sendJson(res, 403, { error: 'Нет доступа' })
        return
      }
      return handleTrainerSelfJournalGet(authCtx, req, res)
    }
    if (action === 'coach-quality') {
      if (authCtx.isAdmin || authCtx.isTrainer || authCtx.isSupervisor) {
        return handleCoachQuality(authCtx, req, res)
      }
      sendJson(res, 403, { error: 'Нет доступа' })
      return
    }
    if (action === 'trainer-schedule') {
      const clubId = String(req.query?.club_id ?? '').trim()
      const ctx = await requireAdminOrSupervisor(req, res, clubId)
      if (!ctx) return
      if (ctx.isSupervisor && !clubId) {
        sendJson(res, 400, { error: 'Укажите club_id' })
        return
      }
      return handleTrainerScheduleGet(ctx, req, res)
    }
    if (action === 'client-retention') {
      if (authCtx.isAdmin || authCtx.isTrainer || authCtx.isSupervisor) {
        return handleClientRetention(authCtx, req, res)
      }
      sendJson(res, 403, { error: 'Нет доступа' })
      return
    }
    if (action === 'client-attendance') {
      if (authCtx.isAdmin || authCtx.isTrainer || authCtx.isSupervisor) {
        return handleClientAttendance(authCtx, req, res)
      }
      sendJson(res, 403, { error: 'Нет доступа' })
      return
    }
    if (action === 'iskra-dispatch') {
      const view = String(req.query?.view ?? 'inbox').trim().toLowerCase()
      if (view === 'sent') {
        if (!canViewClubDispatchSent(authCtx)) {
          sendJson(res, 403, { error: 'Нет доступа к списку заданий' })
          return
        }
      } else if (!authCtx.isAdmin && !authCtx.isTrainer && !authCtx.isSalesManager && !authCtx.isSupervisor) {
        sendJson(res, 403, { error: 'Нет доступа' })
        return
      }
      return handleIskraDispatchGet(authCtx, req, res)
    }
    // VAPID public key + своя подписка: тренер, админ, менеджер, управляющий
    if (action === 'push-subscription') {
      if (!authCtx.isAdmin && !authCtx.isTrainer && !authCtx.isSalesManager && !authCtx.isSupervisor) {
        sendJson(res, 403, { error: 'Нет доступа' })
        return
      }
      return handlePushSubscriptionGet(authCtx, res)
    }
    // Типы абон. (в т.ч. АЗ) нужны менеджеру/управляющему для колонок отчёта продаж
    if (action === 'membership-types') {
      const { canFetchMembershipTypesViaApi } = await import('../src/lib/admin/salesMembershipTypesAccessCore.js')
      if (
        !canFetchMembershipTypesViaApi({
          isAdmin: authCtx.isAdmin,
          isTrainer: authCtx.isTrainer,
          isSalesManager: authCtx.isSalesManager,
          isSupervisor: authCtx.isSupervisor,
        })
      ) {
        sendJson(res, 403, { error: 'Нет доступа' })
        return
      }
      return handleMembershipTypes(authCtx, req, res)
    }
    if (!authCtx.isAdmin && !authCtx.isTrainer && !authCtx.isSupervisor) {
      sendJson(res, 403, { error: 'Нет доступа' })
      return
    }
    if (action === 'challenges') return handleChallenges(authCtx, req, res)
    if (action === 'challenge-trainings') return handleChallengeTrainings(authCtx, req, res)
    // Управляющий не правит справочник упражнений — только чтение для челленджей/карточек
    if (action === 'exercises-meta') return handleExercisesMeta(authCtx, res)
    if (action === 'exercises') {
      if (authCtx.isSupervisor && !authCtx.isAdmin) {
        return handleExercises(authCtx, res)
      }
      if (!authCtx.isAdmin && !authCtx.isTrainer) {
        sendJson(res, 403, { error: 'Нет доступа' })
        return
      }
      return handleExercises(authCtx, res)
    }
    if (authCtx.isSupervisor && !authCtx.isAdmin) {
      sendJson(res, 403, { error: 'Справочник доступен только администратору сети' })
      return
    }
    if (action === 'nutrition-products') return handleNutritionProducts(authCtx, req, res)
    if (action === 'homework-presets') return handleHomeworkPresets(authCtx, req, res)
  }

  if (action === 'sales') {
    const clubId = String(req.query?.club_id ?? '').trim()
    const ctx = await requireAdminOrSalesManager(req, res, clubId)
    if (!ctx) return
    return handleSalesGet(ctx, req, res)
  }

  if (action === 'price-list') {
    const clubId = String(req.query?.club_id ?? '').trim()
    const ctx = await requireAdminOrSalesManager(req, res, clubId)
    if (!ctx) return
    return handlePriceListGet(ctx, req, res)
  }

  if (action === 'tz-price-list') {
    const clubId = String(req.query?.club_id ?? '').trim()
    const ctx = await requireAdminOrSalesManager(req, res, clubId)
    if (!ctx) return
    return handleTzPriceListGet(ctx, req, res)
  }

  if (action === 'az-price-list') {
    const clubId = String(req.query?.club_id ?? '').trim()
    const ctx = await requireAdminOrSalesManager(req, res, clubId)
    if (!ctx) return
    return handleAzPriceListGet(ctx, req, res)
  }

  if (
    action === 'loyalty-settings' ||
    action === 'loyalty-account' ||
    action === 'loyalty-glance' ||
    action === 'loyalty-journal'
  ) {
    const ctx = await requireAuthUser(req, res)
    if (!ctx) return
    if (action === 'loyalty-settings') return handleLoyaltySettingsGet(ctx, req, res)
    if (action === 'loyalty-account') return handleLoyaltyAccountGet(ctx, req, res)
    if (action === 'loyalty-glance') return handleLoyaltyGlanceGet(ctx, req, res)
    return handleLoyaltyJournalGet(ctx, req, res)
  }

  if (action === 'pnk') {
    const clubId = String(req.query?.club_id ?? '').trim()
    const ctx = await requireAdminOrSalesManager(req, res, clubId)
    if (!ctx) return
    return handlePnk(ctx, req, res)
  }

  if (action === 'sale-clips') {
    const clubId = String(req.query?.club_id ?? '').trim()
    const ctx = await requireAdminOrSalesManager(req, res, clubId)
    if (!ctx) return
    return handleSaleClipsGet(ctx, req, res)
  }

  if (action === 'club-sms') {
    const clubId = String(req.query?.club_id ?? '').trim()
    const ctx = await requireAdminOrSalesManager(req, res, clubId)
    if (!ctx) return
    return handleClubSmsGet(ctx, req, res)
  }

  if (action === 'club-call') {
    const clubId = String(req.query?.club_id ?? '').trim()
    const ctx = await requireAdminOrSalesManager(req, res, clubId)
    if (!ctx) return
    return handleClubCallGet(ctx, req, res)
  }

  if (action === 'coach-quality-settings') {
    const clubId = String(req.query?.club_id ?? '').trim()
    const authCtx = await requireAuthUser(req, res)
    if (!authCtx) return
    if (authCtx.isAdmin) {
      return handleCoachQualitySettingsGet(authCtx, req, res)
    }
    const userClub = String(authCtx.profile?.club_id ?? '').trim()
    if (
      (authCtx.isTrainer || authCtx.isSalesManager || authCtx.isSupervisor) &&
      clubId &&
      userClub === clubId
    ) {
      return handleCoachQualitySettingsGet(authCtx, req, res)
    }
    sendJson(res, 403, { error: 'Нет доступа к настройкам качества этого клуба' })
    return
  }

  if (action === 'trainer-pay-plan-settings') {
    const clubId = String(req.query?.club_id ?? '').trim()
    const ctx = await requireAdminOrSalesManager(req, res, clubId)
    if (!ctx) return
    return handleTrainerPayPlanSettingsGet(ctx, req, res)
  }

  if (action === 'trainer-pay-profiles') {
    const clubId = String(req.query?.club_id ?? '').trim()
    const ctx = await requireAdminOrSalesManager(req, res, clubId)
    if (!ctx) return
    return handleTrainerPayProfilesGet(ctx, req, res)
  }

  if (action === 'trainer-pay-payroll-context') {
    const clubId = String(req.query?.club_id ?? '').trim()
    const ctx = await requireAdminOrSalesManager(req, res, clubId)
    if (!ctx) return
    return handleTrainerPayPayrollContextGet(ctx, req, res)
  }

  if (action === 'deletion-audit-log') {
    const ctx = await requireAdmin(req, res)
    if (!ctx) return
    return handleDeletionAuditLogGet(ctx, req, res)
  }

  if (action === 'search' || action === 'clients-last-trainings') {
    const clubId = String(req.query?.club_id ?? req.query?.clubId ?? '').trim()
    const ctx = await requireAdminOrSalesManager(req, res, clubId)
    if (!ctx) return
    if ((ctx.isSalesManager || ctx.isSupervisor) && !clubId) {
      sendJson(res, 400, { error: 'Укажите club_id' })
      return
    }
    if (action === 'search') return handleSearch(ctx, req, res)
    return handleClientsLastTrainings(ctx, req, res)
  }

  if (action === 'journal' || action === 'club-stats' || action === 'club-monthly' || action === 'health-cards') {
    const clubId = String(req.query?.club_id ?? req.query?.clubId ?? '').trim()
    const ctx = await requireAdminOrSupervisor(req, res, clubId)
    if (!ctx) return
    if (ctx.isSupervisor && !clubId) {
      sendJson(res, 400, { error: 'Укажите club_id' })
      return
    }
    if (action === 'journal') return handleJournal(ctx, req, res)
    if (action === 'club-stats') return handleClubStats(ctx, req, res)
    if (action === 'club-monthly') return handleClubMonthly(ctx, req, res)
    return handleHealthCards(ctx, req, res)
  }

  const ctx = await requireAdmin(req, res)
  if (!ctx) return

  switch (action) {
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
          'Укажите action: search, journal, clients-last-trainings, deletion-audit-log, club-stats, club-monthly, coach-quality, trainer-schedule, client-retention, client-attendance, health-cards, sales, price-list, tz-price-list, az-price-list, loyalty-settings, loyalty-account, loyalty-glance, loyalty-journal, gemini-analytics-prefetch, iskra-settings, challenges, challenge-trainings, exercises, membership-types, clubs, create-supervisor',
      })
  }
}

export default withSafeApiHandler(handler, { label: 'admin-data' })
