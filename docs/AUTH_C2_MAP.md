# Вход в приложение: сейчас и на Yandex (C2)

**Актуально:** 2026-08-09.  
**Для кого:** владелец и разработчик перед стендом R2.  
**Статус:** карта + **шов Auth в коде** (`api/_lib/authPort.js` → Supabase). **Свой JWT / хеши паролей ещё не включаем** — только после «стартуем R2…» и живой БД. Runbook: [R2_C2_STAGING_RUNBOOK.md](./R2_C2_STAGING_RUNBOOK.md).

Простыми словами: сейчас «охранник на входе» — сервис Supabase Auth. На российском хостинге (вариант C2) охранник будет **наш**: логин/пароль проверяет наш сервер, выдаёт свой «пропуск» (токен). Остальное приложение (тренировки, Sync, админка) почти не меняется — меняется только как выдают и проверяют пропуск. Вызовы уже идут через порт — на R2 подменим реализацию.

Связано: [STRATEGY_SCALE_AND_RU_HOSTING.md](./STRATEGY_SCALE_AND_RU_HOSTING.md) (C2 + Yandex), [API.md](./API.md).

---

## Сейчас (Vercel + Supabase)

| Что | Где в коде | Зачем |
|-----|------------|-------|
| Логин в браузере | `src/context/AuthContext.jsx` | Сначала `/api/auth-sign-in`, запасной путь — `supabase.auth.signInWithPassword` |
| Нормализация логина | `api/_lib/authLoginResolveCore.js` + `src/lib/` | Логин → email для Auth |
| Порт Auth | `api/_lib/authPort.js` → `authPortSupabase.js` | Единая точка: verify / sign-in / admin create-update-delete |
| Проверка «кто вы» на API | `api/_lib/adminSupabase.js` → `requireAuthUser` → `verifyBearer` | Bearer через порт |
| Роли (admin / trainer / …) | таблица `public.users` + `requireAdmin` и др. | Права на действия |
| Создание тренера | `/api/create-trainer` | Auth user + строка в `users` (через порт) |
| Удаление тренера | `/api/admin-data?action=delete-trainer` | То же без Edge Function |
| Пароль / блок / планшет | `admin-data?action=reset-trainer-password` и соседние | Уже наш API |

Планшет и офлайн **не зависят** от того, где живёт Auth: после входа данные пишутся в IndexedDB и очередь Sync.

---

## Цель на C2 (Yandex Managed Postgres + наш Auth)

| Кусок | Что сделать на стенде R2 |
|-------|---------------------------|
| База | Postgres в Yandex; `npm run db:migrate:pg` (сначала stub `c2_auth_stub.sql`) |
| Пароли | Хранить у себя (или через проверенную библиотеку хешей) — **не** в браузере |
| Вход | Тот же UX: логин + пароль → `/api/auth-sign-in` отдаёт сессию/JWT |
| Проверка API | Реализация `verifyBearer` проверяет **наш** токен |
| Роли | По-прежнему `users.role` (+ club_id) |
| Клиент | `AuthContext` ходит в `/api/*`; прямой `supabase.auth.*` убрать или оставить только как временный мост |
| RLS | На C2 доступ к данным в основном через наш API (service role / пул); политики Supabase-стиля не копируем «как есть» без нужды |

**Не трогаем в том же PR, что Auth:** правила Sync, абонементы, IndexedDB.

---

## Порядок работ (когда будет R2)

1. Поднять Postgres + задеплоить API (`npm start` / Docker) на тестовый адрес — [R2_C2_STAGING_RUNBOOK.md](./R2_C2_STAGING_RUNBOOK.md).  
2. Реализовать минимальный Auth за портом: вход + проверка Bearer.  
3. Прогнать роли: admin, trainer, sales, supervisor.  
4. Сценарий зала: тренировка офлайн → Sync → видно в админке.  
5. Только потом думать про перенос живого клуба (R3).

---

## Что владельцу помнить

- Смена адреса сайта часто = **новый ярлык** на планшете.  
- Пароли админов и доступы к облаку — список у себя, не в чате.  
- Усиление безопасности (лимиты входа и т.п.) — **после** стабильного переезда, см. STRATEGY §5.7.
