# Жизнь клиента по направлениям (ПЗ / ТЗ / АЗ)

**Статус:** ✅ фаза 1 в коде (ПЗ + автоархив клуба); ТЗ/АЗ UI — фаза 2  
**Зачем:** смешанный клиент уходит с персоналки, но остаётся в зале — без ложного «оттока клуба».

Связано: [CLIENT_MULTI_HALL.md](./CLIENT_MULTI_HALL.md), [CLIENT_ARCHIVE.md](./CLIENT_ARCHIVE.md), [CLIENT_RETENTION.md](./CLIENT_RETENTION.md), [LOYALTY.md](./LOYALTY.md).

## Канон

| Правило | Смысл |
|--------|--------|
| Одна карточка | Не три клиента на ПЗ/ТЗ/АЗ |
| Закрываем **направление** | Не человека |
| Открыто | Живой / календарный абон зала **или купленный со стартом впереди**, и нет `closed_at` |
| Архив клуба | Нет открытых направлений → `clients.archived_at` (авто или «Ушёл из клуба») |
| Живой абон в архиве | Сохранение / открытие ТЗ·АЗ·ПЗ с присутствием на направлении → снять `closed_at` и **вернуть из архива** |
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
| Админ / менеджер | **ПЗ \| ТЗ \| АЗ \| Архив**; «Закрыть ПЗ» / «Ушёл из клуба»; «Вернуть в клуб» |
| Продажи | При ТЗ/АЗ с живым ПЗ — «Закрыть ПЗ?» |

**Отложено (когда понадобится):** списки «Живые \| Закрытые» / «закрытый ПЗ при живом ТЗ». Данные `client_hall_lifecycle` и close/reopen уже работают; отдельный список закрытых направлений в UI пока не показываем. Воронка на «Клиенты» — как раньше (по абонементу, без отсечения по `closed_at`).

## Код

| Файл | Роль |
|------|------|
| `src/lib/clientHallLifecycleCore.js` | open/closed, reconcile archive, close/reopen patches, end memberships |
| `src/lib/clientHallLifecycleSyncService.js` | офлайн-first close/reopen + ensure после абона |
| `src/lib/admin/clientHallLifecycleAdminCache.js` | merge lifecycle после admin `list-memberships` |
| `scripts/verify-client-hall-lifecycle.mjs` | verify |
| Миграция | `supabase/migrations/20260821120000_client_hall_lifecycle.sql` |

```bash
npm run db:migrate:client-hall-lifecycle -- --linked
node scripts/verify-client-hall-lifecycle.mjs
```

## Баллы ПЗ

Жжём при **закрытии ПЗ** и при **архиве клуба**. «Снова ПЗ» копилку не восстанавливает.
