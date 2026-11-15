# Вход в приложение: Supabase Auth → свой Auth (C2)

**Актуально:** 2026-11-16.  
**Статус:** на проде **`AUTH_PROVIDER=own`** (с R3, 01.10) — хеш scrypt + JWT; Supabase Auth снят в R4. Ниже — карта шва и **история** перехода; разделы «сейчас Vercel» читать как «было до cutover».

Простыми словами: охранник на входе — наш сервер: проверяет пароль и выдаёт свой пропуск (токен). Флаг `AUTH_PROVIDER=own`.

Связано: [STRATEGY_SCALE_AND_RU_HOSTING.md](./STRATEGY_SCALE_AND_RU_HOSTING.md), [API.md](./API.md), [PROD_SECURITY_CHECKLIST.md](./PROD_SECURITY_CHECKLIST.md), [R2_C2_STAGING_RUNBOOK.md](./R2_C2_STAGING_RUNBOOK.md).

---

## Было (Vercel + Supabase, до R3)

| Что | Где в коде | Зачем |
|-----|------------|-------|
| Логин в браузере | `src/context/AuthContext.jsx` | Сначала `/api/auth-sign-in`, запасной путь — `supabase.auth.signInWithPassword` |
| Нормализация логина | `api/_lib/authLoginResolveCore.js` + `src/lib/` | Логин → email для Auth |
| Порт Auth | `api/_lib/authPort.js` → Supabase или `authPortOwn.js` при `AUTH_PROVIDER=own` | Единая точка: verify / sign-in / admin create-update-delete |
| Проверка «кто вы» на API | `api/_lib/adminSupabase.js` → `requireAuthUser` → `verifyBearer` | Bearer через порт |
| Роли (admin / trainer / …) | таблица `public.users` + `requireAdmin` и др. | Права на действия |
| Поиск сотрудника по email / логину | `src/lib/ilikeExactCore.js` (`ilikeExactPattern`) во всех `.ilike('email'\|'login')` | Точное совпадение без учёта регистра. `_` и `%` экранируются: иначе `a_min@…` находил профиль `admin@…` (эскалация при пустой роли). Проверка — `verify-ilike-exact.mjs` |
| Создание тренера | `/api/create-trainer` | Auth user + строка в `users` (через порт) |
| Удаление тренера | `/api/admin-data?action=delete-trainer` | То же без Edge Function |
| Пароль / блок / планшет | `admin-data?action=reset-trainer-password` и соседние | Уже наш API. При `AUTH_PROVIDER=own` продление сессии (`/auth/v1/token?grant_type=refresh_token`) сверяется с `users`: удалён или `is_active=false` → вход заново; с 06.10 ещё и с `auth_sessions` («Выйти», блок, смена пароля отзывают `sid`). Пропуск (access) живёт до часа, но `/api/*` отказывает заблокированному сразу (кэш роли 30 с) |

Планшет и офлайн **не зависят** от того, где живёт Auth: после входа данные пишутся в IndexedDB и очередь Sync.

---

## Цель на C2 (Yandex Managed Postgres + наш Auth) — ✅ на prod с R3

| Кусок | Что сделали на стенде R2 → прод |
|-------|---------------------------|
| База | Postgres в Yandex; `npm run db:migrate:pg` (сначала stub `c2_auth_stub.sql`) |
| Пароли | Хранить у себя (или через проверенную библиотеку хешей) — **не** в браузере. ✅ Свои — scrypt; перенесённые из Supabase (bcrypt, `bcryptjs`, только сервер) принимаются и при первом входе пересохраняются в scrypt. Перенос — `scripts/r3-import-auth-hashes.mjs`, шаги в `R2_C2_STAGING_RUNBOOK.md` §«Волна 3» |
| Вход | Тот же UX: логин + пароль → `/api/auth-sign-in` отдаёт сессию/JWT |
| Проверка API | Реализация `verifyBearer` проверяет **наш** токен |
| Роли | По-прежнему `users.role` (+ club_id) |
| Клиент | `AuthContext` ходит в `/api/*`; прямой `supabase.auth.*` убрать или оставить только как временный мост |
| RLS | API ходит в базу владельцем таблиц через пул. Прямые запросы браузера (`/rest/v1` на нашем хосте) идут под ролью `authenticated` с claims нашего JWT, поэтому работают те же политики, что на Supabase (`policies.sql` + миграции). Права выдаёт `supabase/c2_rest_grants.sql`: без RLS — только чтение. См. runbook, волна 2, шаг 3 |

**Не трогаем в том же PR, что Auth:** правила Sync, абонементы, IndexedDB.

---

## Порядок работ (R2 → R3) — выполнен

1. Postgres + API на стенде — [R2_C2_STAGING_RUNBOOK.md](./R2_C2_STAGING_RUNBOOK.md).  
2. Auth за портом: вход + проверка Bearer (`AUTH_PROVIDER=own`).  
3. Роли: admin, trainer, sales, supervisor.  
4. Сценарий зала: тренировка офлайн → Sync → админка.  
5. Перенос живого клуба — R3 01.10 (`app-core.ru`).

---

## Что владельцу помнить

- Смена адреса сайта часто = **новый ярлык** на планшете.  
- Пароли админов и доступы к облаку — список у себя, не в чате.  
- Лимит неудачных входов уже в коде (`api/_lib/authRateLimitCore.js`): на Supabase он встроенный, на нашем сервере — только этот. Счётчики «логин + IP», логин со всех IP (знакомый IP не блокируется) и IP; подмена `X-Forwarded-For` не даёт новых попыток, ошибка одного тренера не закрывает вход остальным. Остальное усиление — STRATEGY §5.7.
