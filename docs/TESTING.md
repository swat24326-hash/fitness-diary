# Тестирование и QA

**Актуально:** 2026-08-26. Политика: `.cursor/rules/fitness-diary-ship.mdc`, `fitness-diary-stability.mdc`.

---

## Команды

| Команда | Что делает | Когда |
|---------|------------|--------|
| `npm run lint` | ESLint | **Всегда** перед «готово» |
| `npm run qa:critical` | Критический контур зала+админки (без полного каталога) | После sync/абон/главная/клиенты; план — [CRITICAL_SCENARIOS_QA.md](./CRITICAL_SCENARIOS_QA.md) |
| `npm run qa:local` | build + **список** verify из `scripts/agent-qa.mjs` + lint, без prod smoke | Sync, статистика, абонементы, API agg, форматы упражнений, офлайн |
| `node scripts/verify-security-l1-audit.mjs` | L1: admin-email, push IDOR, pull-guard pnk/clips, порядок debit | После правок auth/push/sync; в `agent-qa` |
| `npm run qa` | как local + prod smoke | Перед релизом / по CI weekly |
| `npm run qa:deep` | Углублённый прогон (`deep-qa.mjs`) | Перед крупным релизом / аудит |
| `npm run qa:roles` / `qa:roles:browser` | Ролевые сценарии | Смена ролей / auth |
| `npm run check:volume` | Объём данных | Рост клуба; см. [DATA_VOLUME.md](./DATA_VOLUME.md) |

Оркестратор: `scripts/agent-qa.mjs` (явный список; на диске может быть больше `verify-*.mjs` — новый скрипт **регистрировать** в `agent-qa.mjs`). Таблица ниже — **критический поднабор**, не полный каталог. CI: `.github/workflows/qa.yml` → `qa:local` на push/PR.

---

## Когда писать `scripts/verify-*.mjs`

Нужен, если логика **ветвистая** и чистая (даты, стадии ПНК, agg, membership, sync-ключи) — без React/IDB в тесте:

1. Вынести правило в `src/lib/…` или `api/_lib/…`.
2. Скрипт: `ok(cond, msg)` + `process.exit(1)` при fail (как соседние verify).
3. Зарегистрировать в `scripts/agent-qa.mjs`.
4. Прогнать `npm run qa:local` или хотя бы сам скрипт.

Не писать verify на чистый CSS/разметку без правил.

---

## Критические сценарии (не ломать)

Полный план + ручной чеклист планшета: **[CRITICAL_SCENARIOS_QA.md](./CRITICAL_SCENARIOS_QA.md)** (`npm run qa:critical`).

| Сценарий | Минимум проверки |
|----------|------------------|
| Новая тренировка → Завершить | дата, абонемент, очередь; двойной тап / автосейв — `verify-training-persist-status.mjs` + `verify-critical-hall.mjs`; reconcile used — `verify-membership-used-reconcile.mjs` |
| Черновик: уход на главную / удаление с карточки | restore — `verify-training-draft-restore.mjs`; delete не воскрешает — `verify-training-draft-delete.mjs`; ручной: Удалить→Да → карточка и вкладки пустые после reload |
| Правка завершённой | смена даты, повторное сохранение |
| Sync на планшете | flush + pull, pending не затираются |
| Архив → Активные: список не обнуляется | `verify-trainer-archive-pull-prune.mjs`; [SYNC.md](./SYNC.md) §«Архив на планшете» |
| Тип карты в журнале / ЗП / офлайн | `verify-membership-type-stats.mjs`, `verify-training-membership-link.mjs`, `verify-stats-agg-parity.mjs`; контур — [SYNC.md](./SYNC.md) §«Тип карты» |
| Админ: статистика / ИСКРА | agg, snapshot |
| ПНК мастер / KPI | целевые `verify-pnk-*.mjs` |
| Качество ведения тренера | `verify-coach-quality.mjs` (TECH + COACH + MANAGER сценарии) |
| Удержание и жизнь клиента | `verify-client-retention.mjs` (pool, cohort M+3, renewal, archive, reactivation, **closed PZ вне R-RET**, `pzChurn*`); закрытие ПЗ — `verify-client-hall-lifecycle.mjs` |
| Жизнь по направлениям | `verify-client-hall-lifecycle.mjs` (A–G); **списки L-A…L-F** — `verify-admin-clients-list-lifecycle.mjs`; migrate `npm run db:migrate:client-hall-lifecycle -- --linked`; [CLIENT_HALL_LIFECYCLE.md](./CLIENT_HALL_LIFECYCLE.md) |
| Причина закрытия (форма) | `verify-client-archive-reason.mjs` (`buildArchiveReasonConfirmPayload`); срок — `verify-client-archive-expected-return.mjs` |


| Журнал restore клиента | `verify-client-restore-event.mjs` |
| Миграция restore на Supabase | `npm run db:migrate:client-restore-events -- --linked` |
| Кабинет ЗП тренера (план / ±₽) | `verify-trainer-pay-profile.mjs`; ставки типов и галочка «В план» — `verify-trainer-pay-tiers.mjs`; база ЗП — `verify-trainer-payroll.mjs`; роли на prod — блок `trainer-pay-profiles` в `npm run qa:roles` (admin OK / trainer+sales 403) |
| Заморозка ЗП месяца | `verify-trainer-pay-month-snapshot.mjs`; прошлый месяц → snapshot, текущий → live |
| Имя продукта (без хардкода в UI) | `verify-product-brand.mjs`; смена имени — `productBrand.js` → `npm run sync:brand` → `gen:icons` |
| Home glance cache | `verify-home-glance-cache.mjs` (TTL / looksSame / профили) |
| Пульс BLE (парсер + память датчика) | `verify-ble-heart-rate.mjs` |
| Сводка пульса сессии (зоны, ккал) | `verify-hr-session-agg.mjs` |
| Лояльность ПЗ (цикл, куш, пропуск) | `verify-loyalty.mjs` (§14 в `docs/LOYALTY.md`) |
| Лояльность: штамп при complete | `verify-loyalty-persist.mjs` (неявка, ккал не из `kcal_est`, абон не трогаем) |
| Лояльность API (доступ, 403/409, не в sync) | `verify-loyalty-api.mjs` |
| Лояльность UI (чип/вкладка, ПНК, пачки 80, не в pull) | `verify-loyalty-ui.mjs` |
| Лояльность: списание и журнал | `verify-loyalty-redeem.mjs` (офлайн disabled, роли, не sync) |
| Лояльность: архив / переезд клуба | `verify-loyalty-archive.mjs` (`burn_archive` / `club_move`, тексты, не выдумываем 0) |
| Лояльность: тумблер и ставки клуба | `verify-loyalty-settings.mjs` (интервалы, confirm, Структура `?tab=loyalty`) |
| Лояльность: стыки с залом | `verify-loyalty-integration.mjs` (complete/Sync/архив не ждут 45 с; ТЗ/АЗ без вкладки; glance не валит Sync) |
| Ручной Sync: flush в шапке, pull по ролям | `verify-sync-header-pull.mjs` (продажи/админ/тренер; сбой справочника и клиентов — не «готово»; менеджер без клуба) |
| Критический контур зала (сшивка) | `verify-critical-hall.mjs` (complete/абон/Sync/ПНК/роли; баллы не в очереди и не в качестве ведения) |
| Пульс при завершении: снимок в дневник, живой буфер не остаётся | `verify-hr-session-persist.mjs` |
| Двойной тап → пульс подхода из слота | `verify-hr-after-from-live.mjs` |
| Шаг/место формы при сплите черновиков | `verify-training-form-step-memory.mjs` |
| Изоляция load/persist при смене вкладки черновика | `verify-training-draft-page-epoch.mjs` |
| Сессионный кэш вкладок черновика (без «Загрузка…») | `verify-training-draft-session-cache.mjs` |
| Durable черновик после блокировки экрана / kill вкладки / PWA-обновления | `verify-training-draft-durable.mjs`, `verify-app-stability.mjs` |
| Восстановление черновика (IDB / durable / session, уход на главную) | `verify-training-draft-restore.mjs` |
| Удаление черновика (очередь delete + tombstone; hydrate/persist/restore не воскрешают) | `verify-training-draft-delete.mjs`; cleanup: `trainingDraftCleanup.js` / `*Core.js` |
| Подход Л/П (стороны, сводка, челлендж, завершение) | `verify-training-set-laterality.mjs` |
| Статус тренировки: completed не откатывается в draft | `verify-training-persist-status.mjs` |
| Pull/push merge: draft, completed `updated_at`, prune | `verify-sync-pull-merge.mjs` |
| Статистика тренера: облако за период (не только IDB) | `verify-trainer-period-stats-remote.mjs` |
| Журнал тренировок: ФИО архивных клиентов (не UUID) | `verify-trainer-journal-clients.mjs` |
| Журнал тренера: фильтр completed за период | `verify-trainer-journal-filter.mjs` |
| Pull: orphan-prune / synced:false / grace после flush | `verify-client-trainings-prune.mjs` |
| Pull: orphan-prune абонементов (ghost после delete в облаке) | `verify-client-memberships-prune.mjs` |
| Pull: orphan-prune опасен при неполном remote | `verify-client-trainings-prune-truncated.mjs` |
| Карточка: полный дневник с сервера (не только если IDB пуст) | `verify-client-trainings-ensure.mjs` |
| Журнал удалений клиентов (снимок + роль) | `verify-deletion-audit.mjs` |
| Код 124578 перед жёстким удалением клиента | `verify-client-hard-delete-confirm.mjs` |
| Профиль тренера: ФИО в «Не активные» из локального кэша | `verify-enrich-inactive-clients-local.mjs` |
| Главная: ряд внимания / soft signals | `verify-admin-home-attention.mjs` |
| Список клиентов: точка/подпись абонемента | `verify-client-list-signals.mjs` |
| Список клиентов: код типа абона (Dm/El) | `verify-client-list-membership-type.mjs` |
| Ранняя / поздняя активация абона (сдвиг дат, дневник vs used, overlap, inspect) | `verify-membership-early-activate.mjs` |
| Push абонементов (даты NOT NULL) | `verify-membership-push-payload.mjs` |
| Push веса: FK training_id | `verify-client-weight-push.mjs` |
| Reconcile `used_trainings` по дневнику | `verify-membership-used-reconcile.mjs` |
| Лимит абона: total ≥ used, confirm на «1» у платных, метка `used > total` | `verify-membership-total-guard.mjs` |
| Тип карты: agg + fallback по дате | `verify-membership-type-stats.mjs` |
| Привязка `membership_id` к тренировке | `verify-training-membership-link.mjs` |
| Archive-pull не стирает активных | `verify-trainer-archive-pull-prune.mjs` |
| Паритет agg клиент ↔ сервер | `verify-stats-agg-parity.mjs` |
| Debit абонемента при first complete | `verify-training-membership-debit.mjs` (в т.ч. перекрытие: сначала старый) |
| Плитка «Трен. n/m» при редактировании завершённой | `verify-training-membership-tile.mjs` |
| ЗП дня/периода: база + надбавка, сценарии без плана, прогноз ур. | `verify-trainer-day-payroll-forecast.mjs` |
| Прогноз ЗП месяца для чистой (уровни к концу + adj) | `verify-trainer-month-payroll-forecast.mjs` |
| Удаление абонемента (тексты confirm) | `verify-membership-delete.mjs` |
| Менеджер: доступ к типам АЗ / выбор списка для отчёта | `verify-sales-membership-types-access.mjs` |
| Переименование code типа карты (уникальность в клубе) | `verify-membership-type-code.mjs` |
| R2 / bare PG: порядок migrate + stub auth.* + SSL | `verify-pg-migrate-order.mjs` |
| Portable host: `/api/health` | `verify-portable-host.mjs` |
| R1: нет prod URL в `src/`/`api/` | `verify-r1-portability.mjs` |
| Менеджер: клиенты клуба (push/club/deep-link) | `verify-sales-manager-clients.mjs` |
| Управляющий: club scope / один на клуб / без журнала удалений | `verify-supervisor-access.mjs` |
| Расход управляющего: статьи + итог / legacy → «Расходы» | `verify-supervisor-expense-parts.mjs` |
| Структура: фильтр тренеров/менеджеров/управляющих по `?club=` | `verify-filter-staff-by-club.mjs` |
| Мои Звонки: конфиг на клуб + merge с env | `verify-moi-zvonki-club-config.mjs` |
| Массовые SMS клуба: получатели, код, очередь, rate-limit | `verify-club-sms-campaign.mjs` |
| Итог массовой SMS (ok/fail/abort) | `verify-club-sms-campaign-result.mjs` |
| Журнал SMS: status ok/fail, фильтры, сводка | `verify-club-sms-log.mjs` |
| Мои Звонки: make_call payload + rate limit | `verify-moi-zvonki-call.mjs` |
| Журнал звонков: insert/shape/фильтры | `verify-club-call-log.mjs` |
| Исход звонка (webhook finish / подписи) | `verify-club-call-outcome.mjs` |
| Входящие звонки (direction / матчинг) | `verify-club-call-inbound.mjs` |
| Кнопка записи (яркая / бледная / пусто) | `verify-club-call-recording-ui.mjs` |
| Лист звонка: чипы пометки | `verify-club-call-sheet-note-chips.mjs` |
| Воронка пометки к звонку | `verify-club-call-funnel-chips.mjs` |
| Оверлей звонка: nested scroll lock | `verify-club-call-overlay-scroll-lock.mjs` |
| История связи клиента: день / всё время / SMS | `verify-client-outreach-history-range.mjs` |
| Живая сверка звонков в зале (A1–A10 / B1–B3) | [MOIZVONKI_SETUP.md](./MOIZVONKI_SETUP.md) § «Живая сверка в зале» |
| Очередь «кому звонить» (glance) | `verify-sales-call-today.mjs` |
| Слоты главной: ПНК / планёрка / звонки | `verify-attention-side-placement.mjs` |
| Presence главной: админ не трёт звонки | `verify-attention-presence-session.mjs` |
| Сводка звонков/SMS по журналу | `verify-club-outreach-stats.mjs` |
| Сводка смены call-центра (день) | `verify-club-call-shift-summary.mjs` |
| Главная: таймауты glance (не вечный скелетон) | `verify-admin-home-glance-timeout.mjs` |
| Доска клиентов: Max (чат) рядом с SMS | `verify-club-client-max-outreach.mjs` |
| Статистика клуба по залу ПЗ/ТЗ/АЗ | `verify-club-stats-hall.mjs` |
| Прайс ПЗ: скидка 10%, Excel→code, импорт AOA, TTL кэша | `verify-price-list.mjs` |
| План: ориентир ПЗ ДК из прайса (8 тр. × действующие) | `verify-sales-plan-pz-dk-suggest.mjs` |
| Стратегия: продления ДК ПЗ/ТЗ/АЗ (конец месяца × ср. покупок) | `verify-sales-plan-hall-renewals.mjs` |
| Стратегия: НК/УК + добор до плана по долям прошлого месяца | `verify-sales-plan-hall-top-up.mjs` |
| Стратегия: playbook недель / закрытия / темп | `verify-sales-strategy-playbook.mjs` |
| Стратегия: полные списки закрытий ПЗ/ТЗ/АЗ | `verify-sales-strategy-playbook-hall-lists.mjs` |
| Стратегия: дрейф при архиве клиентов | `verify-sales-strategy-archive-drift.mjs` |
| Стратегия: снимок playbook (галочки на всех устройствах) | `verify-sales-strategy-snapshot.mjs` |
| Стратегия: админ-полоса часов / ЗП / возвратов / чистой | `verify-sales-strategy-admin-finance.mjs` |
| Финансы: рентабельность по валу (чистая ÷ вал, пороги 15/20/25%) | `verify-club-net-profit-margin.mjs` |
| Стратегия: правка НК/УК перед «В план» | `verify-sales-strategy-nk-uk-edit.mjs` |
| План: частичное сохранение без затирания матрицы/уровней | `verify-sales-plan-row-persist.mjs` |
| План: предупреждение при ручной правке ДК | `verify-sales-plan-dk-edit-warn.mjs` |
| Стратегия: сводная доска пакета (шт / ₽ / доп / ур. 3) | `verify-sales-strategy-package-board.mjs` |
| Стратегия: якорь зала × сезон | `verify-sales-hall-anchor.mjs` |
| Прайс ТЗ: импорт Excel 1мес/акции | `verify-tz-price-list.mjs` |
| Прайс ТЗ: печать HTML / имена PNG | `verify-tz-price-list-print.mjs` |
| Прайс АЗ: импорт Excel Результат/групповые/доплаты | `verify-az-price-list.mjs` |
| Прайс АЗ: печать HTML / имена PNG | `verify-az-price-list-print.mjs` |
| Импорт отчёта по оплатам (1С → дневной) — **мост** | `verify-sales-payments-import.mjs` |
| Уникальность карты в клубе (не сети) при создании | `verify-client-card-unique.mjs` |
| Связка оплат → lite/клип/desk (ПЗ без карточки) | `verify-sales-payments-link.mjs` |
| Импорт часов ПЗ (`otchet_pz` → матрица тренер×тип) | `verify-pz-trainings-report-import.mjs` |
| Продажи: ФИО в матрице/статистике (не UUID) | тот же `verify-pz-trainings-report-import.mjs` (+ `salesTrainerLabelsCore`) |
| Домен платежа (когда появится код) | ТЗ: [PAYMENTS_DOMAIN.md](./PAYMENTS_DOMAIN.md); verify — в той же задаче |
| Desk-сид закрытий (карта + end_date + цена; UI `/admin/excel-lists`) | `verify-desk-closing-import.mjs` |
| Desk ledger абонов (действующий / цена) | `verify-desk-membership-ledger.mjs` |
| Карточка: scope glance/full + lite + nav seed + memory list | `verify-client-workspace-scope.mjs` |
| Статистика клиента: посещаемость, оценка, glance, разорванный ритм, фильтр «выпали», hydrate | `verify-client-attendance-stats.mjs`, `verify-client-attendance-glance.mjs` |
| Статистика клуба: посещаемость ПЗ (окно = период сводки, exact weeks, prefer/truncated, % без выпадения, byTrainer) | `verify-club-attendance-agg.mjs` |
| Клиенты: keep-alive путь список/карточка | `verify-admin-clients-keepalive.mjs` |
| Клиенты: поиск по всем залам + стек ПЗ/ТЗ/АЗ | `verify-admin-clients-cross-hall-search.mjs` |
| Абоны: цена пакета paid_amount (форма) | `verify-membership-paid-amount.mjs` |
| Вкладки ПЗ / ТЗ / АЗ (списки + `memberships.hall`) | `verify-desk-hall-clients.mjs`, `verify-membership-hall.mjs` |
| Ручное создание desk ТЗ/АЗ с списка клиентов | `verify-desk-manual-client-create.mjs` |
| Смена тренера ПЗ: клуб / lite / карта формы / каскад абонов | `verify-client-trainer-reassign.mjs` |
| Desk: очистка ДР без отката при hydrate | `verify-desk-client-birth-form.mjs` |
| Desk: телефон / № карты / ФИО / ack Save / hydrate после flush | `verify-desk-client-form-merge.mjs` |
| Архив: подвкладки ПЗ / ТЗ / АЗ | `verify-admin-clients-archive-hall.mjs` |
| АЗ: фильтр по направлениям | `verify-admin-clients-az-direction-filter.mjs` |
| АЗ: списание занятий + журнал дат | `verify-desk-az-session-deduct.mjs` |
| Desk без тренера + вне KPI (operational filter) | `verify-sale-clips.mjs` (блок hall/desk) |
| Миграция desk на linked Supabase | `npm run db:migrate:desk-hall -- --linked` затем `npm run db:migrate:desk-null-trainer -- --linked` |
| Клип-карта: match / holding / checklist | `verify-sale-clips.mjs` |
| Клип → планшет после Sync (`sale_clips` в теле pull) | `verify-trainer-pull-response.mjs` |
| Продажи: профили bundle shell/daily/month/full | `verify-sales-bundle-profile.mjs` |
| Срок абонемента по умолчанию (+1 календарный месяц) | `verify-date-ru.mjs` |

Дополнительно для расследования «вылетов» в офлайне: смотреть журнал ошибок приложения (`appErrorJournal`) по контексту, содержащему `training-persist` — это путь исключений внутри `TrainingPage.persist()`; ошибки HR/loyalty должны не блокировать сохранение тренировки, а уходить в `appErrorJournal`.

Подробнее: `.cursor/rules/fitness-diary-stability.mdc`, процесс аудита — [DEEP_AUDIT.md](./DEEP_AUDIT.md).

---

## Документация после ship

Если изменились роли, API, sync-таблицы или статус фичи — обновить handoff / [API.md](./API.md) / [SYNC.md](./SYNC.md) / [docs/README.md](./README.md). Иначе следующий чат снова получит устаревшую карту.
