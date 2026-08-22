# Жизнь клиента по направлениям (ПЗ / ТЗ / АЗ)

**Статус:** ✅ фаза 1–2 в коде (ПЗ/ТЗ/АЗ close/reopen + автоархив клуба)  
**Зачем:** смешанный клиент уходит с одного зала, но остаётся в другом — без ложного «оттока клуба».

Связано: [CLIENT_MULTI_HALL.md](./CLIENT_MULTI_HALL.md), [CLIENT_ARCHIVE.md](./CLIENT_ARCHIVE.md), [CLIENT_RETENTION.md](./CLIENT_RETENTION.md), [LOYALTY.md](./LOYALTY.md).

## Канон

| Правило | Смысл |
|--------|--------|
| Одна карточка | Не три клиента на ПЗ/ТЗ/АЗ |
| Закрываем **направление** | Не человека |
| Открыто | Живой / календарный абон зала **или купленный со стартом впереди**, и нет `closed_at` |
| Архив клуба | Нет открытых направлений → `clients.archived_at` (авто или «Ушёл из клуба») |
| Живой абон в архиве | **Сохранение** абона ТЗ·АЗ·ПЗ с присутствием на направлении → снять `closed_at` и **вернуть из архива**. Одно открытие карточки **не** возвращает из архива |
| «Вернуть в клуб» | Снимает `archived_at` **и** открывает залы с живым/ожидающим абоном (не оставляет `closed_at`) |
| Pull | Pending `client_hall_lifecycle` в очереди не затирается облаком |
| Excel закрытий | Архивная карта → `restore_attach`, не вторая карточка |
| Переход ПЗ→ТЗ/АЗ | Закрытие ПЗ при живом ТЗ/АЗ — **не** отток клуба |

## Данные

Таблица `client_hall_lifecycle`: `client_id` + `hall` (`pz`\|`tz`\|`az`), `closed_at`, `close_reason`, `close_reason_at`, `expected_return_on`.  
`clients.archived_at` / `archive_reason` — только **архив клуба**.

## Кнопки (сейчас в UI)

| Кто | UI |
|-----|-----|
| Тренер | **Активные \| Архив** (архив клуба); «Закрыть ПЗ»; «Снова ко мне» в архиве |
| Админ / менеджер | **ПЗ \| ТЗ \| АЗ \| Архив**; «Закрыть ПЗ/ТЗ/АЗ» / «Снова ПЗ/ТЗ/АЗ» на вкладке и в карточке; «Ушёл из клуба»; «Вернуть в клуб» |
| Продажи | При ТЗ/АЗ с живым ПЗ — «Закрыть ПЗ?» |

**Отложено (когда понадобится):** списки «Живые \| Закрытые» / «закрытый ПЗ при живом ТЗ». Данные `client_hall_lifecycle` и close/reopen уже работают; отдельный список закрытых направлений в UI пока не показываем. Воронка на «Клиенты» — как раньше (по абонементу, без отсечения по `closed_at`).

**Списки вкладок ПЗ/ТЗ/АЗ (с lifecycle):** если ПЗ закрыт (`closed_at`), а АЗ или ТЗ жив — клиент **не** на вкладке ПЗ (даже с `trainer_id` и старым абоном). Карточка открывается на живом зале; поиск — только видимые залы. Исчерпанный ПЗ без formal close — в меню «Закрыть ПЗ». Verify списков: `verify-admin-clients-list-lifecycle.mjs` (L-A…L-F ниже).

## Матрица списков (L) — verify-admin-clients-list-lifecycle.mjs

| Блок | Что ловим |
|------|-----------|
| **L-A** | Критические переходы: ПЗ→АЗ/ТЗ, закрытый зал без другого живого (остаётся на вкладке для reopen), multi-hall, счётчики |
| **L-B** | Без lifecycle ctx — legacy; архив клуба; вкладка Архив — без close/reopen |
| **L-C** | Меню: live/depleted close, closed — без close, reopen при живом абоне, hall по вкладке |
| **L-D** | Поиск (stack), карточка: default на живом зале; `preferred=pz` при скрытом ПЗ → fallback |
| **L-F** | ПНК на ПЗ после close ТЗ (reopen на ТЗ); upcoming АЗ; чужой lifecycle; depleted AZ без open; mixed filter |

Связь с **A–G** (`verify-client-hall-lifecycle.mjs`): A–G — close/reopen/sync; L — отображение в списках и карточке после тех же данных.

## Код

| Файл | Роль |
|------|------|
| `src/lib/clientHallLifecycleCore.js` | open/closed, reconcile archive, close/reopen patches, end memberships |
| `src/lib/clientHallLifecycleSyncService.js` | офлайн-first close/reopen + ensure после абона |
| `src/lib/admin/adminClientsListLifecycleCore.js` | видимые залы, hide с вкладки, depleted close, стартовая вкладка карточки |
| `src/lib/admin/adminClientsHallLifecycleMenuCore.js` | подписи и когда показывать «Закрыть/Снова» на вкладке |
| `src/components/admin/AdminClientHallLifecycleActions.jsx` | кнопки на CRM-карточке |
| `src/lib/admin/clientHallLifecycleAdminCache.js` | merge lifecycle после admin `list-memberships` |
| `scripts/verify-client-hall-lifecycle.mjs` | verify close/reopen/sync (A–G) |
| `scripts/verify-admin-clients-list-lifecycle.mjs` | verify списков (L-A…L-F) |
| Миграция | `supabase/migrations/20260821120000_client_hall_lifecycle.sql` |

```bash
npm run db:migrate:client-hall-lifecycle -- --linked
node scripts/verify-client-hall-lifecycle.mjs
```

## Критическая матрица (verify)

В `scripts/verify-client-hall-lifecycle.mjs` (секция `critical matrix phase2 + errors`):

| Блок | Что ловим |
|------|-----------|
| **A** | Close только ТЗ/АЗ → архив; close при другом живом зале → без архива; лояльность не жжётся на ТЗ/АЗ; reopen из архива / без архива |
| **B** | Неизвестный зал; клиент без id/клуба; «Вернётся позже» без даты; reopen без живого абона; меню при архиве клуба / вкладке Архив |
| **C** | Close АЗ не трогает живой ПЗ-абон |
| **D** | Pull не затирает pending `client_hall_lifecycle` |
| **E** | Форма причины: заполнить → `buildArchiveReasonConfirmPayload` (ready) → `planCloseHall` / leave |
| **F** | Нестандартные / краевые (ПНК, depleted, upcoming, auto-close, чужой lifecycle, кириллица зала, повторное close) |
| **G** | Два устройства / Sync: pending защищает close; **без pending** устаревший pull может вернуть «открыто» |

### Sync: два устройства (G)

| ID | Ситуация | Ожидание |
|----|----------|----------|
| G1 | Close на устройстве A, строка в `sync_queue` | Pull не затирает local closed |
| G2 | Close уже в IDB, **pending нет** (не flush / очередь очистили) | Облако со старым `closed_at: null` **может** перезаписать — риск |
| G3 | Pending на другом `id` | Эту строку не защищает |
| G4 | Устройство B закрывает от устаревшего open | Close ok; свой pending защищает |
| G5 | Вместе pending `clients` + lifecycle | Оба store под guard |
| G6 | Пустой key / чужой store | Не ложный блок |

**Операционно:** после «Закрыть ТЗ/АЗ/ПЗ» — Sync (flush), пока не ушёл pending.

Модалка: [`ClientArchiveReasonModal.jsx`](../src/components/ClientArchiveReasonModal.jsx) вызывает тот же `buildArchiveReasonConfirmPayload`.

## Нестандартные сценарии (F)

| ID | Ситуация | Ожидание |
|----|----------|----------|
| F1 | Клиент **ПНК**, закрыли единственный ТЗ | **Не** в архив клуба (ПНК = открытое направление) |
| F2 | Close ПЗ, остался только **исчерпанный** АЗ | Архив клуба (depleted ≠ присутствие) |
| F3 | Close ТЗ при **ожидающем** АЗ (старт впереди) | Без архива |
| F4 | Close ПЗ + был просроченный ТЗ (когда‑то был) | `autoLifecycleRows` закрывает ТЗ («Закончился абонемент») |
| F5 | В lifecycle чужой `client_id` | Не влияет на close/isHallOpen |
| F6 | Close с «Вернётся позже» → reopen | `expected_return_on` / причина сброшены |
| F7 | Повторный close уже закрытого ТЗ при живом АЗ | ok, без архива |
| F8 | `hall: 'ТЗ'` / `'тз'` | Нормализация → tz, close работает |
| F9 | Уже в архиве клуба, close последнего живого | Без второго `archived_at` (patch null) |
| F10 | Menu reopen при closed + **upcoming** абон | Offer reopen = true |

### Prompt для агента (повторный прогон)

```
Контекст: fitness-diary, docs/CLIENT_HALL_LIFECYCLE.md блок F.
Задача: нестандартные сценарии client hall lifecycle — только чистые функции в verify-client-hall-lifecycle.mjs (секции F и G), без React/IDB.
Не ломать A–E. Сначала ошибки/краевые (PNK, depleted, upcoming, auto-close, чужой client_id), затем dual-device pull-guard (G1–G6).
После правок: node scripts/verify-client-hall-lifecycle.mjs && npm run lint.
Если нашёл расхождение с каноном — fix в clientHallLifecycleCore.js / syncPullGuardCore.js + кейс в F/G.
```

## Баллы ПЗ

Жжём при **закрытии ПЗ** и при **архиве клуба**. «Снова ПЗ» копилку не восстанавливает.
