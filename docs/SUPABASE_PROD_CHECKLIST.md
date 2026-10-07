# Чеклист Supabase и Auth перед продом / крупным клубом

Выполнять **до** подключения нового клуба с большим числом тренеров или после смены домена/проекта Supabase.

> **С 01.10.2026 prod — `https://app-core.ru` (ВМ + Managed PG, свой Auth).** Проверки безопасности прода — [PROD_SECURITY_CHECKLIST.md](./PROD_SECURITY_CHECKLIST.md). Этот файл — для старого контура Supabase до его выключения в R4.

Production app (до 01.10): **https://fitness-diary-bice.vercel.app** — теперь redirect.

## 1. Проект и ключи

- [ ] В Vercel (и локально `.env`) заданы `VITE_SUPABASE_URL` и `VITE_SUPABASE_ANON_KEY` (JWT `eyJ…`, **не** `sb_publishable_…`).
- [ ] URL без `/rest/v1/` на конце.
- [ ] Service role **только** в Vercel env для API (не в `VITE_*`).

## 2. Authentication

- [ ] **Site URL** = `https://fitness-diary-bice.vercel.app`
- [ ] **Redirect URLs** включают prod и при необходимости `http://localhost:5173`
- [ ] У каждого админа в **Authentication → Users** есть пользователь; email совпадает с входом в приложение.
- [x] **Sign In / Providers → «Allow new users to sign up» выключено** (prod, 29.09). Сотрудников создаёт только админ (`/api/create-trainer`). Открытая регистрация без подтверждения почты = любой из интернета получает сессию и может пробовать чужие профили.
- [x] Нет забытых QA-учёток (prod 29.09: удалён `qa_auto_trainer`): `select login, role from public.users where login like 'qa_auto_%';` — пусто (после прод-QA их удаляет `qa-roles-cleanup`). Пароль QA больше не в репо: env `QA_PASSWORD` или случайный на запуск.

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
- [x] RLS включён на таблицах, для которых в репо нет политик: `select relname, relrowsecurity from pg_class where relname in ('club_supervisor_expense','user_push_subscriptions','exercises','challenges');` — везде `true`. Иначе их читает anon key (на Supabase) или любой вошедший (на C2, `c2_rest_grants.sql`). 29.09 на prod было `false` у трёх (кроме `exercises`), в тот же день исправлено `npm run db:migrate:rls-gaps` (миграция `20260929130000_rls_gaps.sql`, INC-2026-09-29-01). Новая таблица без RLS ловится `verify-rls-coverage`.
- [ ] `membership_types`: есть `fit_membership_types_sales_manager_read` (менеджер читает **все** типы своего клуба, включая АЗ) — миграция `20260729120000_membership_types_sales_manager_read.sql` или `npm run db:migrate:membership-types-sm -- --linked`.
- [x] `membership_types.counts_toward_pay_plan`: галочка «В план» — `npm run db:migrate:counts-toward-pay-plan -- --linked` (миграция `20260810120000_membership_types_counts_toward_pay_plan.sql`). Применено на linked (2026-08-10).
- [x] `membership_types`: колонки `trainer_pay_l1`, `trainer_pay_l2`, `trainer_pay_l3` — `npm run db:migrate:trainer-pay-tiers -- --linked` (миграция `20260808120000_membership_types_trainer_pay_tiers.sql`). Применено на linked (2026-08-08).
- [x] `club_trainer_pay_plan_settings`: пороги тренировок плана ЗП — `npm run db:migrate:trainer-pay-plan -- --linked`. Применено на linked (2026-08-08).
- [x] `trainer_pay_profiles`: кабинет тренера (план / ±₽) — `npm run db:migrate:trainer-pay-profiles -- --linked` (миграция `20260808140000_trainer_pay_profiles.sql`). Применено на linked (2026-08-08).
- [x] `club_trainer_pay_month_snapshots`: заморозка правил ЗП на месяц — `npm run db:migrate:trainer-pay-month-snapshots -- --linked` (миграция `20260809120000_club_trainer_pay_month_snapshots.sql`). Применено на linked (2026-08-09).
- [x] `club_sms_log.status` / `error_message` — `npm run db:migrate:club-sms-log-status -- --linked` (миграция `20260813210000_club_sms_log_status.sql`). Применено на linked (2026-08-13).
- [x] `club_call_log` — журнал исходящих звонков клуба — `npm run db:migrate:club-call-log -- --linked` (миграция `20260813220000_club_call_log.sql`). Применено на linked (2026-08-13).
- [x] `club_call_log.outcome` — исход webhook (`duration_sec`, `answered`, `finished_at`) — `npm run db:migrate:club-call-outcome -- --linked` (`20260814153000_club_call_log_outcome.sql`). Применено на linked (2026-08-14).
- [x] `club_call_log.recording_url` — ссылка на запись из webhook — `npm run db:migrate:club-call-recording -- --linked` (`20260814210000_club_call_log_recording.sql`). Применено на linked (2026-08-14).
- [x] `club_call_log.direction` + nullable `client_id` — входящие — `npm run db:migrate:club-call-inbound -- --linked` (`20260816020000_club_call_log_inbound.sql`). Применено на linked (2026-08-16).
- [ ] `users` под RLS — миграция `20260929120000_users_rls.sql` (в ветке `r2-c2`, на prod **не** накатана). После неё список сотрудников не читается по anon key и не правится не-админом из браузера. Вход по логину это не ломает: `/api/auth-sign-in` ищет сотрудника сервером. Перед накатом на prod — проверить у старых строк `users.id = auth.uid()` или почту = почте входа (п. 3), иначе свой профиль не прочитается.
- [ ] Таблица `deletion_audit_log` (журнал удалений клиентов) — миграция `20260805210000_deletion_audit_log.sql` + RLS admin / SM read.
- [ ] Таблица `client_restore_events` (журнал «Вернуть из архива» для retention) — миграция `20260820120000_client_restore_events.sql` + RLS admin / SM read.

## 5. Схема БД

- [ ] Все миграции из `supabase/migrations/` применены на **том же** проекте, что и prod-приложение.
- [ ] `club_supervisor_expense.amount_*` (rent / expenses / deposits=оклады / accounting / sales) — разбивка расхода: `20260806160000_…_parts.sql`, `20260806170000_…_sales.sql`.
- [ ] Нет «второго» Supabase-проекта с устаревшей схемой, к которому случайно смотрят в Table Editor.

## 6. Edge Functions (legacy)

- [ ] **Не требуется** для прода: создание/удаление тренера идут через Vercel `/api/create-trainer` и `admin-data?action=delete-trainer` (см. [DEPLOY.md](./DEPLOY.md), [API.md](./API.md)).
- [ ] На Vercel задан server env `SUPABASE_SERVICE_ROLE_KEY`.
- [ ] Создание тренера из админки **Организация / Структура** завершается без бесконечного «Сохраняем…».

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
