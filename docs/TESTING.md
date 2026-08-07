# Тестирование и QA

**Актуально:** 2026-07-17. Политика: `.cursor/rules/fitness-diary-ship.mdc`, `fitness-diary-stability.mdc`.

---

## Команды

| Команда | Что делает | Когда |
|---------|------------|--------|
| `npm run lint` | ESLint | **Всегда** перед «готово» |
| `npm run qa:local` | build + `verify-*.mjs` + lint, без prod smoke | Sync, статистика, абонементы, API agg, форматы упражнений, офлайн |
| `npm run qa` | как local + prod smoke | Перед релизом / по CI weekly |
| `npm run qa:deep` | Углублённый прогон (`deep-qa.mjs`) | Перед крупным релизом / аудит |
| `npm run qa:roles` / `qa:roles:browser` | Ролевые сценарии | Смена ролей / auth |
| `npm run check:volume` | Объём данных | Рост клуба; см. [DATA_VOLUME.md](./DATA_VOLUME.md) |

Оркестратор verify: `scripts/agent-qa.mjs`. CI: `.github/workflows/qa.yml` → `qa:local` на push/PR.

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

| Сценарий | Минимум проверки |
|----------|------------------|
| Новая тренировка → Завершить | дата, абонемент, очередь |
| Правка завершённой | смена даты, повторное сохранение |
| Sync на планшете | flush + pull, pending не затираются |
| Админ: статистика / ИСКРА | agg, snapshot |
| ПНК мастер / KPI | целевые `verify-pnk-*.mjs` |
| Качество ведения тренера | `verify-coach-quality.mjs` (TECH + COACH + MANAGER сценарии) |
| Имя продукта (без хардкода в UI) | `verify-product-brand.mjs`; смена имени — `productBrand.js` → `npm run sync:brand` → `gen:icons` |
| Home glance cache | `verify-home-glance-cache.mjs` (TTL / looksSame / профили) |
| Пульс BLE (парсер + память датчика) | `verify-ble-heart-rate.mjs` |
| Сводка пульса сессии (зоны, ккал) | `verify-hr-session-agg.mjs` |
| Двойной тап → пульс подхода из слота | `verify-hr-after-from-live.mjs` |
| Шаг формы при сплите черновиков | `verify-training-form-step-memory.mjs` |
| Статистика тренера: облако за период (не только IDB) | `verify-trainer-period-stats-remote.mjs` |
| Журнал тренировок: ФИО архивных клиентов (не UUID) | `verify-trainer-journal-clients.mjs` |
| Журнал тренера: фильтр completed за период | `verify-trainer-journal-filter.mjs` |
| Pull: orphan-prune опасен при неполном remote | `verify-client-trainings-prune-truncated.mjs` |
| Карточка: полный дневник с сервера (не только если IDB пуст) | `verify-client-trainings-ensure.mjs` |
| Журнал удалений клиентов (снимок + роль) | `verify-deletion-audit.mjs` |
| Код 124578 перед жёстким удалением клиента | `verify-client-hard-delete-confirm.mjs` |
| Профиль тренера: ФИО в «Не активные» из локального кэша | `verify-enrich-inactive-clients-local.mjs` |
| Главная: ряд внимания / soft signals | `verify-admin-home-attention.mjs` |
| Список клиентов: точка/подпись абонемента | `verify-client-list-signals.mjs` |
| Push абонементов (даты NOT NULL) | `verify-membership-push-payload.mjs` |
| Удаление абонемента (тексты confirm) | `verify-membership-delete.mjs` |
| Менеджер: доступ к типам АЗ / выбор списка для отчёта | `verify-sales-membership-types-access.mjs` |
| Менеджер: клиенты клуба (push/club/deep-link) | `verify-sales-manager-clients.mjs` |
| Управляющий: club scope / один на клуб / без журнала удалений | `verify-supervisor-access.mjs` |
| Расход управляющего: статьи + итог / legacy → «Расходы» | `verify-supervisor-expense-parts.mjs` |
| Структура: фильтр тренеров/менеджеров/управляющих по `?club=` | `verify-filter-staff-by-club.mjs` |
| Мои Звонки: конфиг на клуб + merge с env | `verify-moi-zvonki-club-config.mjs` |
| Доска клиентов: Max (чат) рядом с SMS | `verify-club-client-max-outreach.mjs` |
| Прайс ПЗ: скидка 10%, Excel→code, импорт AOA, TTL кэша | `verify-price-list.mjs` |
| План: ориентир ПЗ ДК из прайса (8 тр. × действующие) | `verify-sales-plan-pz-dk-suggest.mjs` |
| Стратегия: продления ДК ПЗ/ТЗ/АЗ (конец месяца × ср. покупок) | `verify-sales-plan-hall-renewals.mjs` |
| Стратегия: НК/УК + добор до плана по долям прошлого месяца | `verify-sales-plan-hall-top-up.mjs` |
| Стратегия: playbook недель / закрытия / темп | `verify-sales-strategy-playbook.mjs` |
| Стратегия: полные списки закрытий ПЗ/ТЗ/АЗ | `verify-sales-strategy-playbook-hall-lists.mjs` |
| Стратегия: дрейф при архиве клиентов | `verify-sales-strategy-archive-drift.mjs` |
| Стратегия: снимок playbook (галочки на всех устройствах) | `verify-sales-strategy-snapshot.mjs` |
| Стратегия: админ-полоса часов / ЗП / возвратов / чистой | `verify-sales-strategy-admin-finance.mjs` |
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
| Домен платежа (когда появится код) | ТЗ: [PAYMENTS_DOMAIN.md](./PAYMENTS_DOMAIN.md); verify — в той же задаче |
| Desk-сид закрытий (карта + end_date + цена; UI `/admin/excel-lists`) | `verify-desk-closing-import.mjs` |
| Desk ledger абонов (действующий / цена) | `verify-desk-membership-ledger.mjs` |
| Карточка: scope glance/full + lite + nav seed + memory list | `verify-client-workspace-scope.mjs` |
| Клиенты: keep-alive путь список/карточка | `verify-admin-clients-keepalive.mjs` |
| Вкладки ПЗ / ТЗ / АЗ (`desk_hall`) | `verify-desk-hall-clients.mjs` |
| Desk: очистка ДР без отката при hydrate | `verify-desk-client-birth-form.mjs` |
| Архив: подвкладки ПЗ / ТЗ / АЗ | `verify-admin-clients-archive-hall.mjs` |
| АЗ: фильтр по направлениям | `verify-admin-clients-az-direction-filter.mjs` |
| АЗ: списание занятий + журнал дат | `verify-desk-az-session-deduct.mjs` |
| Desk без тренера + вне KPI (operational filter) | `verify-sale-clips.mjs` (блок hall/desk) |
| Миграция desk на linked Supabase | `npm run db:migrate:desk-hall -- --linked` затем `npm run db:migrate:desk-null-trainer -- --linked` |
| Клип-карта: match / holding / checklist | `verify-sale-clips.mjs` |
| Продажи: профили bundle shell/daily/month/full | `verify-sales-bundle-profile.mjs` |
| Срок абонемента по умолчанию (+1 календарный месяц) | `verify-date-ru.mjs` |

Подробнее: `.cursor/rules/fitness-diary-stability.mdc`, процесс аудита — [DEEP_AUDIT.md](./DEEP_AUDIT.md).

---

## Документация после ship

Если изменились роли, API, sync-таблицы или статус фичи — обновить handoff / [API.md](./API.md) / [SYNC.md](./SYNC.md) / [docs/README.md](./README.md). Иначе следующий чат снова получит устаревшую карту.
