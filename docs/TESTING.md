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
| Home glance cache | `verify-home-glance-cache.mjs` (TTL / looksSame / профили) |
| Пульс BLE (парсер + память датчика) | `verify-ble-heart-rate.mjs` |
| Сводка пульса сессии (зоны, ккал) | `verify-hr-session-agg.mjs` |
| Шаг формы при сплите черновиков | `verify-training-form-step-memory.mjs` |
| Статистика тренера: облако за период (не только IDB) | `verify-trainer-period-stats-remote.mjs` |
| Главная: ряд внимания / soft signals | `verify-admin-home-attention.mjs` |
| Список клиентов: точка/подпись абонемента | `verify-client-list-signals.mjs` |
| Push абонементов (даты NOT NULL) | `verify-membership-push-payload.mjs` |
| Удаление абонемента (тексты confirm) | `verify-membership-delete.mjs` |
| Менеджер: доступ к типам АЗ / выбор списка для отчёта | `verify-sales-membership-types-access.mjs` |
| Прайс ПЗ: скидка 10%, связка Excel→code, тарифы из типов | `verify-price-list.mjs` |
| Продажи: профили bundle shell/daily/month/full | `verify-sales-bundle-profile.mjs` |
| Срок абонемента по умолчанию (+1 календарный месяц) | `verify-date-ru.mjs` |

Подробнее: `.cursor/rules/fitness-diary-stability.mdc`, процесс аудита — [DEEP_AUDIT.md](./DEEP_AUDIT.md).

---

## Документация после ship

Если изменились роли, API, sync-таблицы или статус фичи — обновить handoff / [API.md](./API.md) / [SYNC.md](./SYNC.md) / [docs/README.md](./README.md). Иначе следующий чат снова получит устаревшую карту.
