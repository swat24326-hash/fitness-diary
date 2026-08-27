# Sync — очередь, flush, pull

**Актуально:** 2026-08-26. Политика кода: `.cursor/rules/fitness-diary-sync.mdc`. Инциденты: [RUNBOOK.md](./RUNBOOK.md).

---

## Зачем

Планшет тренера работает **офлайн**. Запись сначала локально; облако догоняет. Pull **не должен** затирать несинхронизированные правки.

---

## Поток

```
UI → saveLocalWithSync(store, record, { table_name, operation, remote_id })
   → IndexedDB (сущность) + sync_queue
   → online: /api/push-record или /api/push-records
   → ручной Sync: 1) flush очереди  2) pull (trainer-pull / admin-data / reference)
```

Ключевые модули: `src/lib/syncService.js`, `syncApiClient.js`, `localDb.js` (`enqueueSync`, `putStoreUnlessPendingSync`). Ручной Sync в шапке: `useHeaderSync.js` (flush, прогресс) → `syncHeaderPullService.js` (pull по роли).

---

## UI полоски Sync

Во время ручного Sync кнопка показывает **%** и технический label в `title`. Под шапкой — полоска **`sync-motto`**: короткие цитаты/советы по зонам прогресса (банк в `src/lib/syncMotivationCore.js`). Длинная фраза дочитывается вертикальным автоскроллом; при `prefers-reduced-motion` полоска временно выше.

Ошибки и офлайн — обычный русский текст (без девизов). Техсписок шагов (`справочник · рабочая область…`) сохраняется в **Помощь → Последний Sync** (`getLastSyncReport` / `setLastSyncReport`).

Проверка банка: `node scripts/verify-sync-motivation.mjs`.

---

## Правила

1. **Не обходить** `saveLocalWithSync` ради «быстрого» сохранения в облако с UI тренера.
2. **Ручной Sync:** сначала flush, потом pull. Сбой справочника/клиентов/челленджей — **«готово с замечаниями»**, не зелёный успех. Менеджер без `club_id` у профиля и админ без клуба в URL — тоже замечание. Pull баллов (glance) **не** держит Sync и **не** ставит ошибку. Типы абон / питание / ДЗ: **force-merge только если очередь ушла** (`resolveHeaderSyncForceFromCloud`) — иначе pending не затираем. Verify: `scripts/verify-sync-header-pull.mjs`, `scripts/verify-critical-hall.mjs`.
3. **Pull merge:** для охраняемых stores не перезаписывать строку, если по ней есть pending в очереди. Дополнительно: `synced: false` и черновики `trainings` не затираются; у **completed** побеждает более новый `updated_at` (`shouldApplyCloudRowOnPull` / `rowRevisionMs`); **облачный draft не откатывает** локальный `completed`. Исключение: **synced draft ← облачный `completed`** с другого устройства — принимаем completed, если он не старше локального (`verify-sync-pull-merge` F9). Колонка `trainings.updated_at` — миграция `20260822190000_trainings_updated_at.sql` (`npm run db:migrate:trainings-updated-at -- --linked`). Локально метка ставится в `saveLocalWithSync`; на push сервер пишет `updated_at` и возвращает `record` в ответ. Verify: `scripts/verify-sync-pull-merge.mjs` (сценарии A–F, в т.ч. нестандартные).
3a. **Черновик при блокировке экрана:** последние правки пишутся синхронно в `localStorage` (durable-мост, `trainingDraftDurable*`), flush IDB при `visibility=hidden` / `pagehide` из live-ref (без stale closure). После kill вкладки hydrate берёт durable, если он новее IDB; completed не откатывается. Verify: `scripts/verify-training-draft-durable.mjs`.
3b. **Черновик и PWA-обновление:** `decideAppUpdate` откладывает reload на `/…/workouts/` и при открытом/свежем durable черновике (в т.ч. ушли на главную). Перед `applyPwaUpdate` — flush registry; после reload `hydrateTrainingDraftsFromDurable` поднимает снимок в IDB (в т.ч. создание строки, если её ещё не было). См. [PWA.md](./PWA.md).
3c. **Удаление черновика (карточка / абон / завершение):** `deleteLocalWithSync('trainings', …)` снимает строку IDB и ставит `delete` в очередь. Параллельно **обязательно** `notifyTrainingDraftDeleted` / `clearTrainingDraftArtifacts` (`trainingDraftCleanup.js`): durable + session LRU + open-guard. Иначе `DraftTabsBar` → `hydrateTrainingDraftsFromDurable` снова создаёт draft из `localStorage`. Hydrate и persist **не** пишут training id, если по нему pending `delete` в `sync_queue` или tombstone вкладки (`canPersistTrainingDraft`). Pull с pending delete не восстанавливает строку (`buildPendingSyncKeysByTable` / `putStoreUnlessPendingSync`). Verify: `scripts/verify-training-draft-delete.mjs`. UI: `ClientDiaries`, `MembershipManager`, `dataAccess.deleteClientAndAllData`, cleanup при complete в `TrainingPage`.
3d. **Уход на главную / возврат в черновик:** ввод сразу в live-ref; flush session+durable при уходе; при открытии `pickTrainingDraftRestore` выбирает самый полный снимок (IDB / durable / session) в окне «богатства». Verify: `scripts/verify-training-draft-restore.mjs`.
3e. **Hydrate дневника / orphan-prune:** не удалять локальные `draft`, id в sync_queue, **`synced: false`**, и строки с `updated_at`/`created_at` младше **2 мин** (гонка flush→hydrate при слабой сети). При `truncated` prune пропускаем. Verify: `scripts/verify-client-trainings-prune.mjs`.
3f. **Hydrate / Sync абонементов / orphan-prune:** то же для `memberships` (ghost после удаления в облаке). Не трогаем `synced: false`, pending и свежие (&lt;2 мин). Club `list-memberships` — prune только если `truncated !== true`. Verify: `scripts/verify-client-memberships-prune.mjs`.
4. **memberships push:** `start_date` / `end_date` в БД NOT NULL. При **update** пустые/null даты **опускаются** из payload (`normalizeMembershipPushPayload`), чтобы списание `used_trainings` не затирало даты. При **insert** даты обязательны. Verify: `scripts/verify-membership-push-payload.mjs`.
5. **Менеджер продаж + типы абон.:** Sync у менеджера — flush + pull `membership_types` (свой клуб). Колонки АЗ в дневном отчёте обновляются ещё кнопкой **«Обновить»** на `/sales`. API: `admin-data?action=membership-types` доступен менеджеру; RLS: `fit_membership_types_sales_manager_read`. Без этого «Обновить» мог показывать устаревший IDB без нового R3+. Док: [SALES_MANAGER.md](./SALES_MANAGER.md).
6. **Невосстановимые ошибки push:** 403 без прав (роль/клуб) и часть **400** по датам membership (`isUnrecoverablePushError` в `syncFlushResult.js`) — **снимаем** запись из очереди, не крутим 12 раз. Сообщения вроде «Менеджер может менять только клиентов и абонементы…», «Нет доступа…», «другого клуба». Менеджер **не** пишет медкарту/вес/замеры в обычном UI (read-only на вкладке здоровья), кроме **каскада удаления desk** ТЗ/АЗ: тогда разрешён delete по `trainings` / `health_cards` / `body_measurements` / `client_weight_entries` своего клуба (`SALES_MANAGER_DESK_DELETE_EXTRA_TABLES`).
7. **Вес и FK `training_id`:** если тренировки уже нет в облаке (удалена/ещё не ушла), push **не падает** — `clientWeightPushCore.js` + `pushRecordCore` снимают `training_id`, вес сохраняется; при pending insert тренировки запись веса **ждёт** (defer). Verify: `verify-client-weight-push.mjs`.
8. **Управляющий (`supervisor`):** может входить в `/api/push-record(s)` (`canUseSyncPushApi`); дальше `authorizePush` / `mutationAuth` режут чужой клуб и запрещённые таблицы (`isSupervisorDeniedPushTable`).
9. **Финиш тренировки (критический путь):** `TrainingPage.persist()` должен завершаться без падения UI даже при исключении в любой async-ветке (save/debit/hr/nav). Ошибка пишется в `appErrorJournal` с контекстом, содержащим `training-persist`, в форме показывается `saveError` (или `autosaveStatus=error` для silent). HR-снимок и штамп лояльности — best-effort (не блокируют «Закончить»). Debit абонемента — `trainingMembershipDebit.js`. После успешного локального `completed`: **`runTrainingCompleteFollowUp(clientId)`** без `await` — событие `training-completed`, reconcile `used_trainings` (`membershipUsedReconcile.js`), `scheduleBackgroundSyncDrain()` при online. На экране — чип «В очереди: N» (`useSyncOutboundPoll` с **`queueOnly`**: только длина `sync_queue`, без `getAll` по stores — иначе на слабом планшете «Закончить» + автосейв + полный scan душат IndexedDB). Пока `completeBusy`: автосейв **пауза** (`shouldSkipSilentPersistWhileCompleteInFlight` — в т.ч. **уже стоящие в mutex** silent-сейвы выходят без записи), `setBackgroundSyncPaused(true)` (нет push/collapse/drain поверх IDB), ставки лояльности ждут ≤`LOYALTY_COMPLETE_SETTINGS_WAIT_MS`, чеклист/late-start без повторного `listTrainingsForClient` (берём `otherCompletedTrainings` с load).
10. **Prefetch тренера (online, не блокирует UI):** при открытии формы тренировки / карточки клиента — фоновый `ensureClientTrainingsCached` + `refreshMembershipsForStats` (`trainingClientPrefetch.js`, TTL дневника 90 с). Pull-guard pending не ослабляем.
11. **IndexedDB — одно соединение на вкладку:** `getDb()` в `localDb.js` — singleton через `openDB`; параллельные `openDB` давали `AbortError: Lock broken… steal` при одновременном ручном Sync, prefetch и фоновом drain. **Ручной Sync** ставит `setBackgroundSyncPaused(true)` на время flush+pull; фоновый drain по `fitness-diary-storage` debounce 5 с. Если «Последний Sync» пишет «в очереди N», а очередь уже пуста — `reconcileLastSyncReportWithQueue` после фонового drain.
12. **Таймауты pull при ручном Sync:** UI-клики — `ADMIN_FETCH_TIMEOUT_MS` (5 с). **Sync-pull** — `SYNC_PULL_FETCH_TIMEOUT_MS` (45 с): `trainer-pull`, полный справочник упражнений (`force: true`); потолок всего ручного Sync — `MANUAL_SYNC_GUARD_MS` в `useHeaderSync.js`. Иначе cold start Vercel давал «Таймаут связи» при живом сервере или зависание на ~84%.
13. **Новая синхронизируемая таблица:**
   - migration + RLS;
   - добавить в `PUSH_ALLOWED_TABLES` (`api/_lib/pushRecordCore.js`);
   - путь flush в sync-сервисе;
   - store/индексы в `localDb.js` при офлайн-кэше;
   - pull (trainer-pull / admin-data / reference), если данные нужны на устройстве;
   - обновить [DATA_MODEL.md](./DATA_MODEL.md) и этот файл при смене allowlist.
   - права в `api/_lib/mutationAuth.js`.

---

## Allowlist push (`PUSH_ALLOWED_TABLES`)

`clients`, `memberships`, `trainings`, `health_cards`, `body_measurements`, `client_weight_entries`, `challenges`, `exercises`, `membership_types`, `nutrition_products`, `homework_presets`, `pnk_funnel_events`, `sale_clips`, `client_hall_lifecycle`, **`trainer_schedule_entries`**.

**Порядок отправки:** `trainings` уходят **раньше** `trainer_schedule_entries` (волны auto-push и flush), иначе связь `linked_training_id` ломается на FK / «тренировка ещё не в облаке». Логика: `src/lib/syncQueuePriorityCore.js`.

`club_loyalty_settings` и `loyalty_ledger` **не** в allowlist (только `admin-data?action=loyalty-*`). Архив клуба и смена `club_id` пишут `burn_archive` / `club_move` **на сервере** после успешного push `clients`; закрытие **ПЗ** без архива клуба — `burn_archive` после push `client_hall_lifecycle` (`source: pz_hall_close`). Store `loyalty_glance` — кэш GET, не очередь. После ручного Sync тренера: flush → `trainer-pull` → GET `loyalty-glance` пачками ≤80 (не в теле pull).

Создание клипа менеджером — через **`admin-data?action=sale-clips`**; тренер закрывает клип (`done` + `memberships.clip_id`) через очередь push.

**Pull → IndexedDB:** `fetchTrainerPullViaApi` обязан прокидывать `sale_clips`, `pnk_funnel_events`, `client_hall_lifecycle`, **`trainer_schedule_entries`**, `club_id`, `outreach_templates` (`normalizeTrainerPullPayload`). Иначе Sync «успешен», а на главной тренера заявки на абон = 0. Verify: `verify-trainer-pull-response.mjs`, `verify-trainer-schedule-core.mjs`.

**Хвост sale_clips:** remote pull отдаёт только `awaiting`. После reconcile (абоны уже созданы вручную → cancel/done) локальные «лишние» awaiting снимаются (`planTrainerSaleClipsPrune`). Иначе на планшете висят заявки, которых в облаке уже нет.

---

## Охрана pull (`PULL_MERGE_GUARD_STORES` в `syncPullGuardCore.js` → `localDb.js`)

`clients`, `memberships`, `trainings`, `health_cards`, `body_measurements`, `client_weight_entries`, `pnk_funnel_events`, `sale_clips`, `client_hall_lifecycle`, **`trainer_schedule_entries`**.

`health_cards` в IDB ключуется по **`client_id`**, не по `id` записи — учитывать в ключах очереди.

---

## Endpoints

| Направление | Endpoint |
|-------------|----------|
| Push одна / пачка | `/api/push-record`, `/api/push-records` |
| Pull тренера | `/api/trainer-pull` |
| Админ / справочники / продажи | `/api/admin-data?action=…` |

Если на планшете **неполный дневник** в карточке (пусто или только часть дат), а в облаке/статистике тренировки есть: при открытии «Тренировки»/«Абонементы» hydrate `get-client` full дописывает весь дневник в IndexedDB и пересчитывает used; журнал статистики тоже дописывает строки периода. Обрезанный pull **не** чистит локальные тренировки как «лишние».

### Тип карты в статистике и офлайн (2026-08)

Один контур для дневника, журнала, agg ЗП и ИСКРЫ — `membershipTypeStatsAgg.js` (клиент + `api/_lib/`):

1. **`trainings.data.membership_id`** — явная привязка (первый `completed` + backfill при save, если пусто).
2. **Fallback по дате** — `resolveMembershipForDiaryTraining`, если `membership_id` нет (legacy).
3. **Источник абонементов для UI статистики:**
   - **Тренер онлайн:** `trainer-pull` (`skip_trainings=1`) через `loadClubMembershipsWithApiFallback(clubId, { trainerId })`; **не** `/api/list-memberships` (403).
   - **Админ / sales:** `/api/list-memberships` → абоны **и** `client_hall_lifecycle` в IndexedDB (close/reopen ПЗ/ТЗ/АЗ на втором устройстве). Helper без `trainerId`.
   - **Офлайн / сбой API:** `listMembershipsByClubId` (IndexedDB); тип считается локально, если абоны клиента в кэше.
4. **Repair:** журнал тренера (online) — `repairTrainingsMembershipLinks` → `cacheCloudTrainingsLocally`.
5. **Prefetch карточки:** `refreshMembershipsForStats({ trainerId })` → merge в IDB; cooldown 60 с.

Verify: `verify-membership-type-stats.mjs`, `verify-training-membership-link.mjs`. Runbook: [RUNBOOK.md](./RUNBOOK.md) §5.

### Архив на планшете: не стирать «Активных» (2026-08)

Pull вкладки **Архив** (`trainer-pull?archived=1`) **дописывает** архивных в IndexedDB и чистит только «лишних» архивных. Живых клиентов и очередь sync **не** трогает (`trainerPullClientPruneCore`). Pull active/archive **по очереди** (не параллельно в IDB). Иначе при слабой сети: Архив 3 → назад на Активные → **0** до Sync. Если «Активные 0» при ненулевом Архиве — UI сам делает active-pull. Verify: `verify-trainer-archive-pull-prune.mjs`.

Каталог: [API.md](./API.md).

---

## Проверки

- Изменения sync/offline → `npm run qa:local` или целевой `scripts/verify-sync*.mjs`.
- Новые типы АЗ у менеджера → `scripts/verify-sales-membership-types-access.mjs`.
- Не использовать `navigate(0)` после Sync — событие обновления данных.

---

## ⏸ Backlog — админ без обязательного Sync (online-first)

**Статус:** отложено; тренерский офлайн/очередь **не трогаем**.

Админ (и по возможности менеджер) за ПК с сетью: запись сразу через `/api/admin-data?action=…` (auth на сервере), без обязательного ритуала Sync; кнопка Sync у админа → скорее «Обновить данные». MVP при старте: desk-импорт + абоны на карточке, затем правки клиентов; не смешивать с `saveLocalWithSync` на одном экране. Образец уже есть: создание `sale_clips` через API.

**Сейчас (временный UX):** после архива / возврата / удаления / смены тренера / нового клиента вызывается `flushCriticalWritesToCloud` — очередь дожимается без кнопки Sync; если не ушло — alert с просьбой нажать Sync.
