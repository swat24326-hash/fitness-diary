# Симптом → код (CODE_TRACE)

**Актуально:** 2026-09-01  
**Для кого:** агент и разработчик — **куда смотреть в репо**, не дублируя [SYNC.md](./SYNC.md) и [INCIDENTS.md](./INCIDENTS.md).

**Как пользоваться:** жалоба → код направления в [INCIDENTS.md](./INCIDENTS.md) §2 → строка ниже → grep по путям → узкий doc из [AGENT_PLAYBOOK.md](./AGENT_PLAYBOOK.md) §3.

---

## Общие узлы (часто на стыке)

| Зона | Файлы | Зачем |
|------|--------|--------|
| Запись + очередь | `src/lib/dataAccess.js` → `saveLocalWithSync` | Любая локальная запись с push |
| Очередь flush / pull | `src/lib/syncService.js`, `syncFlushResult.js`, `syncLocalRecords.js` | Sync в шапке |
| Pull не затирает pending | `src/lib/localDb.js` (`putStoreUnlessPendingSync`), `syncPullGuardCore.js` | INC **C** |
| IDB stores | `src/lib/localDb.js` | Версия схемы — в handoff |
| Push API | `api/push-record.js`, `api/_lib/pushRecordCore.js`, `mutationAuth.js` | Серверный allowlist |
| Pull тренера | `api/trainer-pull.js`, `src/lib/trainerPullService.js`, `trainerPullIncremental.js` | Планшет после Sync |
| Событие «данные обновились» | `src/lib/syncUiBridge.js` | Не `navigate(0)` |

---

## Зал (A–H)

### A — черновик, вкладки, сплит клиентов

| Слой | Путь |
|------|------|
| UI вкладок | `src/components/DraftTabsBar.jsx`, `src/pages/trainer/TrainingPage.jsx` |
| Сессия / epoch | `src/lib/trainingDraftSessionCache.js`, `trainingDraftTabSwitchCore.js`, `trainingDraftRestoreCore.js` |
| Диск (durable) | `src/lib/trainingDraftDurableStorage.js`, `trainingDraftDurableHydrate.js` |
| Скрытие вкладки | `src/hooks/useTrainingDraftHideFlush.js` |
| Verify | `verify-training-draft-tab-switch`, `verify-training-draft-page-epoch`, `verify-training-draft-restore`, `verify-training-draft-durable` |
| Docs | [SYNC.md](./SYNC.md) §3a–3d, INCIDENTS **A** |

### B — «Закончить», списание абонемента

| Слой | Путь |
|------|------|
| UI завершения | `src/pages/trainer/TrainingPage.jsx`, `src/components/TrainingForm.jsx` |
| Списание | `src/lib/trainer/trainingMembershipDebit.js`, `trainingMembershipDebitCore.js` |
| Связь тренировка ↔ абон | `src/lib/trainingMembershipLinkCore.js` |
| Пересчёт used | `src/lib/membership/membershipUsedReconcileCore.js` |
| Статус persist | `src/lib/trainingPersistStatusCore.js` (если «Сохраняем…») |
| Verify | `verify-training-membership-debit`, `verify-training-persist-status`, `verify-membership-used-reconcile` |
| Docs | INCIDENTS **B**, [CRITICAL_SCENARIOS_QA.md](./CRITICAL_SCENARIOS_QA.md) |

### C — Sync, очередь, «только на устройстве»

| Слой | Путь |
|------|------|
| Оркестрация | `src/lib/syncService.js`, `src/components/AppHeader.jsx` (кнопка Sync) |
| Очередь | `src/lib/localDb.js` (`sync_queue`), `syncQueueOrphans.js`, `syncUnsyncedCore.js` |
| Pull merge | `src/lib/trainerPullService.js`, `syncHeaderPullTrainer.js`, `syncHeaderPullService.js` |
| Архив / prune | `src/lib/trainerPullClientPruneCore.js`, `clientTrainingsPrune.js`, `clientMembershipsPrune.js` |
| API | `api/trainer-pull.js`, `api/push-records.js` |
| Verify | `verify-sync-offline`, `verify-sync-unsynced`, `verify-sync-pull-merge` |
| Docs | [SYNC.md](./SYNC.md), [RUNBOOK.md](./RUNBOOK.md) §1, INCIDENTS **C** |

### D — статистика есть, карточка / дневник пусто

| Слой | Путь |
|------|------|
| Hydrate журнала | `src/lib/clientTrainingsEnsure.js`, `clientTrainingsCache.js` |
| UI карточки | `src/components/ClientDiaries.jsx`, `src/pages/trainer/ClientOverview.jsx` |
| Сводка vs список | `src/lib/trainer/trainerPeriodStatsService.js`, `trainerSelfPayroll.js` |
| Админ hydrate | `src/lib/admin/adminClientHydrate.js` |
| Verify | `verify-client-trainings-prune`, `verify-critical-hall` |
| Docs | `fitness-diary-fix-comprehensive.mdc`, INCIDENTS **D** |

### E — PWA, вход, сессия

| Слой | Путь |
|------|------|
| Auth UI | `src/context/AuthContext.jsx`, `src/App.jsx` |
| Вход API | `api/auth-sign-in.js`, `api/_lib/authLoginResolveCore.js` |
| Клиент входа | `src/lib/authSignInService.js`, `authLoginResolveCore.js` |
| SW / обновление | `src/lib/appLifecycle.js`, `appUpdateApplyService.js`, `appBuildInfo.js` |
| Verify | `verify-auth-sign-in-*`, `verify-auth-session-recover` |
| Docs | [PWA.md](./PWA.md), [RUNBOOK.md](./RUNBOOK.md) §4, INCIDENTS **E** |

### F — главная, активные / архив

| Слой | Путь |
|------|------|
| Главная | `src/pages/trainer/TrainerDashboard.jsx` |
| Списки клиентов | `src/components/trainer/TrainerClientListItem.jsx`, `clientListSignals.js` |
| Pull архива | `trainerPullClientPruneCore.js`, [SYNC.md](./SYNC.md) §«Архив на планшете» |
| Verify | `verify-critical-hall`, `verify-app-stability` |
| Docs | INCIDENTS **F** |

### G — форма, пульс, Л/П

| Слой | Путь |
|------|------|
| Форма | `src/components/TrainingForm.jsx`, `trainingFormStepMemory.js` |
| Пульс / HR | `docs/TRAINING_HR.md`, agg пульса в admin/trainer stats |
| Verify | `verify-training-set-laterality`, `verify-exercise-format` |
| Docs | INCIDENTS **G** |

### H — абон блокирует старт / сохранение

| Слой | Путь |
|------|------|
| Правила | `src/lib/membershipRules.js` |
| UI абона | `src/components/MembershipManager.jsx` |
| Сдвиг дат | `src/lib/trainer/membershipStartShiftService.js` |
| Verify | `verify-membership-total-guard`, `verify-training-membership-link` |
| Docs | INCIDENTS **H** |

---

## Админ (I–L)

### I — статистика, agg, чипы, snapshot

| Слой | Путь |
|------|------|
| UI | `src/pages/admin/AdminStatistics.jsx`, `GeminiAnalyticsPanel.jsx` |
| Agg клиент | `src/lib/admin/clubClientPeriodAgg.js`, `membershipTypeStatsAgg.js`, `coachQualityAgg.js` |
| Период / scope | `src/lib/periodStats/buildScopePeriodStats.js`, `clubMonthAnalyticsCore.js` |
| API | `api/admin-data.js` → `api/_lib/adminData/clubHandlers.js` |
| Сервер agg | `api/_lib/membershipTypeStatsAgg.js` |
| Snapshot ИСКРА | `src/lib/admin/geminiAnalyticsSnapshot.js` |
| Verify | `verify-stats-agg-parity`, `verify-club-client-period`, `verify-membership-type-stats` |
| Docs | [COACH_QUALITY.md](./COACH_QUALITY.md), INCIDENTS **I** |

### J — ИСКРА, бриф, ответы

| Слой | Путь |
|------|------|
| UI | `src/components/GeminiAnalyticsPanel.jsx`, `iskra/IskraDispatchModal.jsx` |
| Handler | `api/_lib/geminiAnalyticsHandler.js`, `geminiAnalyticsData.js` |
| KB | `src/lib/admin/iskraKnowledgeBaseArticles.js` |
| Verify | по зоне (prompt, snapshot) |
| Docs | `docs/ISKRA_*.md`, INCIDENTS **J** |

### K — клиенты админки, импорт, пустые вкладки

| Слой | Путь |
|------|------|
| Список | `src/lib/admin/adminClientsListService.js`, `AdminClientsListRow.jsx` |
| Hydrate | `adminClientHydrate.js` |
| Импорт | `docs/PZ_CLIENTS_ONBOARD.md`, `docs/AZ_CLIENTS_ONBOARD.md` |
| Verify | `verify-admin-clients-*` (см. [TESTING.md](./TESTING.md)) |
| Docs | INCIDENTS **K** |

### L — клубы, роли, управляющий

| Слой | Путь |
|------|------|
| UI / маршруты | `src/pages/club/*`, handoff §роли |
| Правила доступа | `api/_lib/mutationAuth.js`, `requireAdmin` в `api/_lib/` |
| Docs | [CLUB_SUPERVISOR.md](./CLUB_SUPERVISOR.md), INCIDENTS **L** |

---

## Продажи (M–N)

### M — воронка, ПНК, прогноз, матрица

| Слой | Путь |
|------|------|
| Домен | `src/lib/admin/salesManagerStatsAgg.js`, `salesPlanMatrixCompare.js`, `pnk/` |
| UI | страницы `/sales`, компоненты `SalesPlan*`, `SalesStrategy*` |
| Verify | `verify-sales-*`, `verify-club-finance-*` |
| Docs | [SALES_MANAGER.md](./SALES_MANAGER.md), [PNK_FUNNEL.md](./PNK_FUNNEL.md), INCIDENTS **M** |

### N — импорт Excel, мост оплат

| Слой | Путь |
|------|------|
| Импорт | сервисы в `src/lib/admin/` + docs onboard |
| Verify | `verify-pz-*`, attach payments |
| Docs | [PZ_CLIENTS_ONBOARD.md](./PZ_CLIENTS_ONBOARD.md), INCIDENTS **N** |

---

## Связь и инфра (O–Q)

### O — SMS, звонки, Max

| Слой | Путь |
|------|------|
| API | `api/_lib/moiZvonki*.js`, `admin-data?action=` для журнала |
| UI | `AdminClubMoizvonkiSection.jsx`, outreach на главной менеджера |
| Docs | [MOIZVONKI_SETUP.md](./MOIZVONKI_SETUP.md), INCIDENTS **O** |

### P — деплой, старая сборка, chunk

| Слой | Путь |
|------|------|
| SW / баннер | `src/lib/appUpdateApplyService.js`, `vite.config.js` (PWA) |
| Диагностика | `src/lib/appBuildInfo.js` — поле «Сборка» |
| Docs | [PWA.md](./PWA.md), [RELEASE.md](./RELEASE.md), INCIDENTS **P** |

### Q — auth, RLS, клуб ≠ облако

| Слой | Путь |
|------|------|
| Auth | `api/auth-sign-in.js`, `AuthContext.jsx` |
| Push auth | `api/_lib/mutationAuth.js`, `pushRecordCore.js` |
| RLS | `supabase/policies.sql`, `supabase/migrations/` |
| Verify | `verify-security-l1-audit` |
| Docs | [SUPABASE_PROD_CHECKLIST.md](./SUPABASE_PROD_CHECKLIST.md), [RUNBOOK.md](./RUNBOOK.md) §3–4, INCIDENTS **Q** |

---

## Быстрый grep

```bash
# пример: жалоба на черновик
rg "trainingDraft" src/lib src/components src/pages

# sync не сходит
rg "flushQueue|enqueueSync|putStoreUnlessPending" src/lib

# agg не сходится
rg "StatsAgg|buildScopePeriodStats" src/lib api/_lib
```

Полный список verify: `scripts/agent-qa.mjs`, [TESTING.md](./TESTING.md).

---

## Обновлять этот файл когда

- Новый **критический** модуль на пути A–C или I/M.
- Разрезали god-файл → поправить пути здесь в том же PR.
- Не дублировать поведение — только **где лежит код**.
