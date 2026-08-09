# Sync — очередь, flush, pull

**Актуально:** 2026-08-09. Политика кода: `.cursor/rules/fitness-diary-sync.mdc`. Инциденты: [RUNBOOK.md](./RUNBOOK.md).

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
4. **memberships push:** `start_date` / `end_date` в БД NOT NULL. При **update** пустые/null даты **опускаются** из payload (`normalizeMembershipPushPayload`), чтобы списание `used_trainings` не затирало даты. При **insert** даты обязательны. Verify: `scripts/verify-membership-push-payload.mjs`.
5. **Менеджер продаж + типы абон.:** Sync у менеджера — flush + pull `membership_types` (свой клуб). Колонки АЗ в дневном отчёте обновляются ещё кнопкой **«Обновить»** на `/sales`. API: `admin-data?action=membership-types` доступен менеджеру; RLS: `fit_membership_types_sales_manager_read`. Без этого «Обновить» мог показывать устаревший IDB без нового R3+. Док: [SALES_MANAGER.md](./SALES_MANAGER.md).
6. **403 без прав (роль/клуб):** сообщения вроде «Менеджер может менять только клиентов и абонементы…», «Нет доступа…», «другого клуба» — **снимаем** запись из очереди (`isUnrecoverablePushError`), не крутим 12 раз. Менеджер **не** пишет медкарту/вес/замеры (UI read-only на вкладке здоровья).
7. **Новая синхронизируемая таблица:**
   - migration + RLS;
   - добавить в `PUSH_ALLOWED_TABLES` (`api/_lib/pushRecordCore.js`);
   - путь flush в sync-сервисе;
   - store/индексы в `localDb.js` при офлайн-кэше;
   - pull (trainer-pull / admin-data / reference), если данные нужны на устройстве;
   - обновить [DATA_MODEL.md](./DATA_MODEL.md) и этот файл при смене allowlist.

---

## Allowlist push (`PUSH_ALLOWED_TABLES`)

`clients`, `memberships`, `trainings`, `health_cards`, `body_measurements`, `client_weight_entries`, `challenges`, `exercises`, `membership_types`, `nutrition_products`, `homework_presets`, `pnk_funnel_events`, `sale_clips`.

Создание клипа менеджером — через **`admin-data?action=sale-clips`**; тренер закрывает клип (`done` + `memberships.clip_id`) через очередь push.

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

Если на планшете **неполный дневник** в карточке (пусто или только часть дат), а в облаке/статистике тренировки есть: при открытии «Тренировки»/«Абонементы» hydrate `get-client` full дописывает весь дневник в IndexedDB и пересчитывает used; журнал статистики тоже дописывает строки периода. Обрезанный pull **не** чистит локальные тренировки как «лишние».

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
