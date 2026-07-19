# Sync — очередь, flush, pull

**Актуально:** 2026-07-19. Политика кода: `.cursor/rules/fitness-diary-sync.mdc`. Инциденты: [RUNBOOK.md](./RUNBOOK.md).

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

Ключевые модули: `src/lib/syncService.js`, `syncApiClient.js`, `localDb.js` (`enqueueSync`, `putStoreUnlessPendingSync`).

---

## UI полоски Sync

Во время ручного Sync кнопка показывает **%** и технический label в `title`. Под шапкой — полоска **`sync-motto`**: короткие цитаты/советы по зонам прогресса (банк в `src/lib/syncMotivationCore.js`). Длинная фраза дочитывается вертикальным автоскроллом; при `prefers-reduced-motion` полоска временно выше.

Ошибки и офлайн — обычный русский текст (без девизов). Техсписок шагов (`справочник · рабочая область…`) сохраняется в **Помощь → Последний Sync** (`getLastSyncReport` / `setLastSyncReport`).

Проверка банка: `node scripts/verify-sync-motivation.mjs`.

---

## Правила

1. **Не обходить** `saveLocalWithSync` ради «быстрого» сохранения в облако с UI тренера.
2. **Ручной Sync:** сначала flush, потом pull.
3. **Pull merge:** для охраняемых stores не перезаписывать строку, если по ней есть pending в очереди.
4. **Новая синхронизируемая таблица:**
   - migration + RLS;
   - добавить в `PUSH_ALLOWED_TABLES` (`api/_lib/pushRecordCore.js`);
   - путь flush в sync-сервисе;
   - store/индексы в `localDb.js` при офлайн-кэше;
   - pull (trainer-pull / admin-data / reference), если данные нужны на устройстве;
   - обновить [DATA_MODEL.md](./DATA_MODEL.md) и этот файл при смене allowlist.

---

## Allowlist push (`PUSH_ALLOWED_TABLES`)

`clients`, `memberships`, `trainings`, `health_cards`, `body_measurements`, `client_weight_entries`, `challenges`, `exercises`, `membership_types`, `nutrition_products`, `homework_presets`.

Продажи daily/plan, ИСКРА dispatch/settings, push subscriptions — обычно через **`admin-data`**, не через эту очередь.

---

## Охрана pull (`PULL_MERGE_GUARD_STORES` в `localDb.js`)

`clients`, `memberships`, `trainings`, `health_cards`, `body_measurements`, `client_weight_entries`.

`health_cards` в IDB ключуется по **`client_id`**, не по `id` записи — учитывать в ключах очереди.

---

## Endpoints

| Направление | Endpoint |
|-------------|----------|
| Push одна / пачка | `/api/push-record`, `/api/push-records` |
| Pull тренера | `/api/trainer-pull` |
| Админ / справочники / продажи | `/api/admin-data?action=…` |

Каталог: [API.md](./API.md).

---

## Проверки

- Изменения sync/offline → `npm run qa:local` или целевой `scripts/verify-sync*.mjs`.
- Не использовать `navigate(0)` после Sync — событие обновления данных.
