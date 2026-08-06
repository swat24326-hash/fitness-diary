# Чеклист Supabase и Auth перед продом / крупным клубом

Выполнять **до** подключения нового клуба с большим числом тренеров или после смены домена/проекта Supabase.

Production app: **https://fitness-diary-bice.vercel.app**

## 1. Проект и ключи

- [ ] В Vercel (и локально `.env`) заданы `VITE_SUPABASE_URL` и `VITE_SUPABASE_ANON_KEY` (JWT `eyJ…`, **не** `sb_publishable_…`).
- [ ] URL без `/rest/v1/` на конце.
- [ ] Service role **только** в Vercel env для API (не в `VITE_*`).

## 2. Authentication

- [ ] **Site URL** = `https://fitness-diary-bice.vercel.app`
- [ ] **Redirect URLs** включают prod и при необходимости `http://localhost:5173`
- [ ] У каждого админа в **Authentication → Users** есть пользователь; email совпадает с входом в приложение.

## 3. Таблица `public.users`

- [ ] `users.id` **равен** UUID из Auth (не старый произвольный id).
- [ ] `role` = `admin` или `trainer` (латиница; миграция кириллицы: `20260520140000_users_role_cyrillic_rls.sql`).
- [ ] `is_active` = true для работающих тренеров.
- [ ] У тренера при необходимости задан `club_id`.

Пример проверки (SQL Editor):

```sql
select u.id, u.email, u.role, u.is_active, u.club_id
from public.users u
order by u.role, u.email;
```

## 4. RLS и политики

- [ ] Выполнен актуальный **`supabase/policies.sql`** (или `npm run db:migrate` после `supabase link`).
- [ ] Таблицы приложения: clients, trainings, memberships, health_cards, body_measurements — политики из репозитория.
- [ ] Для `clubs`, `exercises`, `challenges`, `membership_types` — политики соответствуют тому, что ожидает приложение (см. комментарии в `policies.sql`).
- [ ] `membership_types`: есть `fit_membership_types_sales_manager_read` (менеджер читает **все** типы своего клуба, включая АЗ) — миграция `20260729120000_membership_types_sales_manager_read.sql` или `npm run db:migrate:membership-types-sm -- --linked`.
- [ ] Таблица `deletion_audit_log` (журнал удалений клиентов) — миграция `20260805210000_deletion_audit_log.sql` + RLS admin / SM read.

## 5. Схема БД

- [ ] Все миграции из `supabase/migrations/` применены на **том же** проекте, что и prod-приложение.
- [ ] `club_supervisor_expense.amount_*` (rent / expenses / deposits / accounting) — разбивка расхода управляющего: `20260806160000_club_supervisor_expense_parts.sql`.
- [ ] Нет «второго» Supabase-проекта с устаревшей схемой, к которому случайно смотрят в Table Editor.

## 6. Edge Functions

- [ ] Задеплоены `create-trainer`, `delete-trainer` (см. `docs/DEPLOY.md`).
- [ ] Создание тренера из админки **Организация** завершается без бесконечного «Сохраняем…».

## 7. Лимиты бесплатного тарифа (контроль)

| Ресурс | На free | При росте |
|--------|---------|-----------|
| Supabase DB / API | квоты Free | Pro перед крупным клубом |
| Vercel functions | ≤12 | не добавлять лишние `api/*.js` |
| Connection resets | возможны | мониторить RUNBOOK |

План перехода на платные тарифы: [PAID_TIER_MIGRATION.md](./PAID_TIER_MIGRATION.md).

## 8. После проверки

- [ ] Один тестовый Sync с планшета: запись → Sync → запись видна в Table Editor.
- [ ] Скрин **Помощь / Диагностика** с полем **Сборка** (bundle id) сохранён для сравнения с деплоем.

См. [RUNBOOK.md](./RUNBOOK.md), [RELEASE.md](./RELEASE.md).
