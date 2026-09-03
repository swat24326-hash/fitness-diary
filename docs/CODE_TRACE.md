# Симптом → код (CODE_TRACE)

**Актуально:** 2026-09-01  
**Для кого:** агент и разработчик — **куда смотреть в репо**, не дублируя [SYNC.md](./SYNC.md) и [INCIDENTS.md](./INCIDENTS.md).

**Как пользоваться:** жалоба → код **A–Q** в [INCIDENTS.md](./INCIDENTS.md) §2 → секция ниже → `rg` по путям → узкий doc из [AGENT_PLAYBOOK.md](./AGENT_PLAYBOOK.md) §3.

**Пути:** полные от корня репо (`src/…`, `api/…`, `scripts/…`).

---

## Общие узлы (часто на стыке)

| Зона | Файлы | Зачем |
|------|--------|--------|
| Запись + очередь | `src/lib/syncService.js` (`saveLocalWithSync`); реэкспорт в `src/lib/dataAccess.js` | Любая локальная запись с push |
| Очередь flush / pull | `src/lib/syncService.js`, `src/lib/syncFlushResult.js`, `src/lib/syncLocalRecords.js` | Sync в шапке |
| Pull не затирает pending | `src/lib/localDb.js` (`putStoreUnlessPendingSync`), `src/lib/syncPullGuardCore.js` (`cloudPutAllowedOnPull`), `src/lib/syncFlushResult.js` (`shouldPreserveLocalRowOnPull`) | INC **C** |
| IDB stores | `src/lib/localDb.js` | Версия схемы — [PROJECT_HANDOFF_FOR_AI.md](./PROJECT_HANDOFF_FOR_AI.md) |
| Push API | `api/push-record.js`, `api/push-records.js`, `api/_lib/pushRecordCore.js`, `api/_lib/mutationAuth.js` | Серверный allowlist |
| Pull тренера | `api/trainer-pull.js`, `src/lib/trainerPullService.js`, `src/lib/trainerPullIncremental.js` | Планшет после Sync |
| Событие «данные обновились» | `src/lib/syncUiBridge.js` | Не `navigate(0)` |

---

## Зал (A–H)

### A — черновик, вкладки, сплит клиентов

| Слой | Путь |
|------|------|
| UI вкладок | `src/components/DraftTabsBar.jsx`, `src/pages/trainer/TrainingPage.jsx` |
| Сессия / epoch | `src/lib/trainingDraftSessionCache.js`, `src/lib/trainingDraftTabSwitchCore.js`, `src/lib/trainingDraftRestoreCore.js` |
| Диск (durable) | `src/lib/trainingDraftDurableStorage.js`, `src/lib/trainingDraftDurableHydrate.js` |
| Скрытие вкладки | `src/hooks/useTrainingDraftHideFlush.js` |
| Verify | `scripts/verify-training-draft-tab-switch.mjs`, `scripts/verify-training-draft-page-epoch.mjs`, `scripts/verify-training-draft-restore.mjs`, `scripts/verify-training-draft-durable.mjs` |
| Docs | [SYNC.md](./SYNC.md) §3a–3d, INCIDENTS **A** |

### B — «Закончить», списание абонемента

| Слой | Путь |
|------|------|
| UI завершения | `src/pages/trainer/TrainingPage.jsx`, `src/components/TrainingForm.jsx` |
| Списание | `src/lib/trainer/trainingMembershipDebit.js`, `src/lib/trainer/trainingMembershipDebitCore.js` |
| Связь тренировка ↔ абон | `src/lib/trainingMembershipLinkCore.js` |
| Пересчёт used | `src/lib/membership/membershipUsedReconcileCore.js` |
| Статус persist | `src/lib/trainingPersistStatusCore.js` (если «Сохраняем…») |
| Verify | `scripts/verify-training-membership-debit.mjs`, `scripts/verify-training-persist-status.mjs`, `scripts/verify-membership-used-reconcile.mjs` |
| Docs | INCIDENTS **B**, [CRITICAL_SCENARIOS_QA.md](./CRITICAL_SCENARIOS_QA.md) |

### C — Sync, очередь, «только на устройстве»

| Слой | Путь |
|------|------|
| Оркестрация | `src/lib/syncService.js`, `src/components/AppHeader.jsx` (кнопка Sync) |
| Очередь | `src/lib/localDb.js` (`sync_queue`), `src/lib/syncQueueOrphans.js`, `src/lib/syncUnsyncedCore.js` |
| Pull merge | `src/lib/trainerPullService.js`, `src/lib/syncHeaderPullTrainer.js`, `src/lib/syncHeaderPullService.js` |
| Архив / prune | `src/lib/trainerPullClientPruneCore.js`, `src/lib/clientTrainingsPrune.js`, `src/lib/clientMembershipsPrune.js` |
| API | `api/trainer-pull.js`, `api/push-records.js` |
| Verify | `scripts/verify-sync-offline.mjs`, `scripts/verify-sync-unsynced.mjs`, `scripts/verify-sync-pull-merge.mjs` |
| Docs | [SYNC.md](./SYNC.md), [RUNBOOK.md](./RUNBOOK.md) §1, INCIDENTS **C** |

### D — статистика есть, карточка / дневник пусто

| Слой | Путь |
|------|------|
| Hydrate журнала | `src/lib/clientTrainingsEnsure.js`, `src/lib/clientTrainingsCache.js` |
| UI карточки | `src/components/ClientDiaries.jsx`, `src/pages/trainer/ClientOverview.jsx` |
| Сводка vs список | `src/lib/trainer/trainerPeriodStatsService.js`, `src/lib/trainer/trainerSelfPayroll.js` |
| Админ hydrate | `src/lib/admin/adminClientHydrate.js` |
| Verify | `scripts/verify-client-trainings-prune.mjs`, `scripts/verify-critical-hall.mjs` |
| Docs | `.cursor/rules/fitness-diary-fix-comprehensive.mdc`, INCIDENTS **D** |

### E — PWA, вход, сессия

| Слой | Путь |
|------|------|
| Auth UI | `src/context/AuthContext.jsx`, `src/App.jsx` |
| Вход API | `api/auth-sign-in.js`, `api/_lib/authLoginResolveCore.js` |
| Клиент входа | `src/lib/authSignInService.js`, `src/lib/authLoginResolveCore.js` |
| SW / обновление | `src/lib/appLifecycle.js`, `src/lib/appUpdateApplyService.js`, `src/lib/appBuildInfo.js` |
| Verify | `scripts/verify-auth-sign-in-fallback.mjs`, `scripts/verify-auth-sign-in-fast-path.mjs`, `scripts/verify-auth-session-recover.mjs` |
| Docs | [PWA.md](./PWA.md), [RUNBOOK.md](./RUNBOOK.md) §4, INCIDENTS **E** |

### F — главная, активные / архив

| Слой | Путь |
|------|------|
| Главная | `src/pages/trainer/TrainerDashboard.jsx` |
| Списки клиентов | `src/components/trainer/TrainerClientListItem.jsx`, `src/lib/clientListSignals.js` |
| Pull архива | `src/lib/trainerPullClientPruneCore.js`, [SYNC.md](./SYNC.md) §«Архив на планшете» |
| Verify | `scripts/verify-critical-hall.mjs`, `scripts/verify-app-stability.mjs` |
| Docs | INCIDENTS **F** |

### G — форма, пульс, Л/П

| Слой | Путь |
|------|------|
| Форма | `src/components/TrainingForm.jsx`, `src/lib/trainingFormStepMemory.js` |
| Пульс / HR | [TRAINING_HR.md](./TRAINING_HR.md), agg в trainer/admin stats |
| Verify | `scripts/verify-training-set-laterality.mjs`, `scripts/verify-exercise-format.mjs` |
| Docs | INCIDENTS **G** |

### H — абон блокирует старт / сохранение

| Слой | Путь |
|------|------|
| Правила | `src/lib/membershipRules.js` |
| UI абона | `src/components/MembershipManager.jsx` |
| Сдвиг дат | `src/lib/trainer/membershipStartShiftService.js` |
| Verify | `scripts/verify-membership-total-guard.mjs`, `scripts/verify-training-membership-link.mjs` |
| Docs | INCIDENTS **H** |

---

## Админ (I–L)

### I — статистика, agg, чипы, snapshot

| Слой | Путь |
|------|------|
| UI | `src/pages/admin/AdminStatistics.jsx`, `src/components/GeminiAnalyticsPanel.jsx` |
| Agg клиент | `src/lib/admin/clubClientPeriodAgg.js`, `src/lib/admin/membershipTypeStatsAgg.js`, `src/lib/admin/coachQualityAgg.js` |
| Период / scope | `src/lib/periodStats/buildScopePeriodStats.js`, `src/lib/admin/clubMonthAnalyticsCore.js` |
| API | `api/admin-data.js` → `api/_lib/adminData/clubHandlers.js` |
| Сервер agg | `api/_lib/membershipTypeStatsAgg.js` |
| Snapshot ИСКРА | `src/lib/admin/geminiAnalyticsSnapshot.js` |
| Verify | `scripts/verify-stats-agg-parity.mjs`, `scripts/verify-club-client-period.mjs`, `scripts/verify-membership-type-stats.mjs` |
| Docs | [COACH_QUALITY.md](./COACH_QUALITY.md), INCIDENTS **I** |

### J — ИСКРА, бриф, ответы

| Слой | Путь |
|------|------|
| UI | `src/components/GeminiAnalyticsPanel.jsx`, `src/components/iskra/IskraDispatchModal.jsx` |
| Handler | `api/_lib/geminiAnalyticsHandler.js`, `api/_lib/geminiAnalyticsData.js` |
| KB | `src/lib/admin/iskraKnowledgeBaseArticles.js` |
| Verify | по зоне (prompt, snapshot) — см. [TESTING.md](./TESTING.md) |
| Docs | `docs/ISKRA_*.md`, INCIDENTS **J** |

### K — клиенты админки, импорт, пустые вкладки

| Слой | Путь |
|------|------|
| Список | `src/lib/admin/adminClientsListService.js`, `src/lib/admin/deskHallClientsCore.js`, `src/lib/admin/adminClientsListLifecycleCore.js`, `src/components/admin/AdminClientsListRow.jsx` |
| Hydrate | `src/lib/admin/adminClientHydrate.js` |
| Импорт | [PZ_CLIENTS_ONBOARD.md](./PZ_CLIENTS_ONBOARD.md), [AZ_CLIENTS_ONBOARD.md](./AZ_CLIENTS_ONBOARD.md) |
| Verify | см. `scripts/verify-admin-clients-*.mjs` в [TESTING.md](./TESTING.md) |
| Docs | INCIDENTS **K** |

### L — клубы, роли, управляющий

| Слой | Путь |
|------|------|
| Маршруты `/club` | `src/App.jsx` (`accessMode="supervisor"`) |
| UI управляющего | `src/pages/admin/AdminDashboard.jsx`, `src/pages/admin/ClubSupervisorClients.jsx`, `src/pages/admin/ClubSupervisorSettings.jsx` |
| Контекст клуба | `src/lib/clubContext.js` |
| Правила доступа | `api/_lib/mutationAuth.js`, `api/_lib/adminSupabase.js` (`requireAdmin*`, `requireAuthUser`) |
| Verify | `scripts/verify-security-l1-audit.mjs` (роли) |
| Docs | [CLUB_SUPERVISOR.md](./CLUB_SUPERVISOR.md), INCIDENTS **L** |

---

## Продажи (M–N)

### M — воронка, ПНК, прогноз, матрица

| Слой | Путь |
|------|------|
| Домен | `src/lib/admin/salesManagerStatsAgg.js`, `src/lib/admin/salesPlanMatrixCompare.js`, `src/lib/pnk/` |
| UI | `src/pages/admin/AdminSales.jsx`, `src/pages/admin/SalesPnk.jsx`, компоненты `SalesPlan*`, `SalesStrategy*` |
| API | `api/_lib/adminData/salesHandlers.js`, `api/_lib/adminData/pnkHandlers.js` |
| Verify | `scripts/verify-sales-plan-matrix-compare.mjs`, `scripts/verify-club-finance-forecast.mjs` (полный каталог: `verify-sales-*.mjs` в [TESTING.md](./TESTING.md)) |
| Docs | [SALES_MANAGER.md](./SALES_MANAGER.md), [PNK_FUNNEL.md](./PNK_FUNNEL.md), INCIDENTS **M** |

### N — импорт Excel, мост оплат

| Слой | Путь |
|------|------|
| Импорт / attach | `src/lib/admin/salesPaymentsLinkApplyService.js`, onboard-сервисы в `src/lib/admin/` |
| Verify | `scripts/verify-pz-trainings-report-import.mjs` и смежные в [TESTING.md](./TESTING.md) |
| Docs | [PZ_CLIENTS_ONBOARD.md](./PZ_CLIENTS_ONBOARD.md), INCIDENTS **N** |

---

## Связь и инфра (O–Q)

### O — SMS, звонки, Max

| Слой | Путь |
|------|------|
| API | `api/_lib/moiZvonkiHandler.js`, `api/_lib/moiZvonkiCallHandler.js`, `api/_lib/moiZvonkiWebhookHandler.js`; `api/admin-data.js` |
| UI | `src/components/admin/AdminClubMoizvonkiSection.jsx`, `src/lib/admin/salesCallTodayCore.js` (главная менеджера) |
| Verify | `scripts/verify-sales-call-today.mjs` |
| Docs | [MOIZVONKI_SETUP.md](./MOIZVONKI_SETUP.md), INCIDENTS **O** |

### P — деплой, старая сборка, chunk

| Слой | Путь |
|------|------|
| SW / баннер | `src/lib/appUpdateApplyService.js`, `vite.config.js` (PWA) |
| Диагностика | `src/lib/appBuildInfo.js` — поле «Сборка» в Помощь → Диагностика |
| Verify | `scripts/verify-app-stability.mjs` |
| Docs | [PWA.md](./PWA.md), [RELEASE.md](./RELEASE.md), INCIDENTS **P** |

### Q — auth, RLS, клуб ≠ облако

| Слой | Путь |
|------|------|
| Auth | `api/auth-sign-in.js`, `src/context/AuthContext.jsx` |
| Push auth | `api/_lib/mutationAuth.js`, `api/_lib/pushRecordCore.js` |
| RLS | `supabase/policies.sql`, `supabase/migrations/` |
| Verify | `scripts/verify-security-l1-audit.mjs` |
| Docs | [SUPABASE_PROD_CHECKLIST.md](./SUPABASE_PROD_CHECKLIST.md), [RUNBOOK.md](./RUNBOOK.md) §3–4, INCIDENTS **Q** |

---

## Быстрый grep

```bash
# черновик
rg "trainingDraft" src/lib src/components src/pages

# sync не сходит
rg "flushQueue|enqueueSync|putStoreUnlessPending" src/lib

# agg не сходится
rg "StatsAgg|buildScopePeriodStats" src/lib api/_lib
```

Полный список verify: `scripts/agent-qa.mjs`, [TESTING.md](./TESTING.md).  
**Применимость карты:** `node scripts/verify-code-trace.mjs`.

---

## Обновлять этот файл когда

- Новый **критический** модуль на пути A–C или I/M.
- Разрезали god-файл → поправить пути в том же PR.
- Не дублировать поведение из SYNC/API — только **где лежит код**.
