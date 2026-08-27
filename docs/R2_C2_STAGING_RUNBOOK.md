# R2 / C2 — стенд на Yandex (приложение уже подготовлено)

**Актуально:** 2026-08-27 (перепроверка prep; день R2 без изменений).  
**Статус:** runbook для дня команды «стартуем R2 на Yandex, C2». До команды **не** поднимаем Managed PG и не переключаем прод.

Связано: [STRATEGY_SCALE_AND_RU_HOSTING.md](./STRATEGY_SCALE_AND_RU_HOSTING.md) §5.4 R2, [AUTH_C2_MAP.md](./AUTH_C2_MAP.md), [SYNC.md](./SYNC.md).

---

## Два уровня дня R2 (важно)

| Уровень | Что поднимаем | Данные / Auth | Когда |
|---------|---------------|---------------|--------|
| **A. Hybrid (день 1)** | Node API + статика на Yandex (`npm start` / Docker) | Пока **те же** `SUPABASE_*` (PostgREST + Auth) | Сразу после команды — проверить хост и Sync на новом origin |
| **B. True C2** | + Managed PostgreSQL + `db:migrate:pg` | Свой Postgres; свой JWT за `authPort` | Следом в том же окне R2; **не** в ночь cutover клуба |

Прод клуба остаётся на **Vercel + Supabase**, пока не скажете стартовать R2 / потом R3.

**Пока нет:** отдельный слой `pg` вместо supabase-js в runtime API. Hybrid A работает без него. True C2 для **записи/чтения зала** через Managed PG — отдельный шаг после живой схемы (см. STRATEGY).

---

## Что уже в репо (prep, прод не трогает)

| Кусок | Где |
|-------|-----|
| Portable API + статика | `server/` → `npm run build && npm start` |
| Health | `GET /health` и `GET /api/health` |
| Docker | `Dockerfile` (+ build-args `VITE_*`) |
| Миграции bare PG | `npm run db:migrate:pg` + stub `supabase/c2_auth_stub.sql` |
| Шов Auth | `api/_lib/authPort.js` (сейчас Supabase) |
| Env-заготовки | `.env.example` (блок C2) |
| Verify | `verify-pg-migrate-order.mjs`, `verify-portable-host.mjs` |

---

## День R2 (после вашей команды)

### 1. Env

Скопируйте `.env.example` → секреты стенда.

**Hybrid A (минимум):**

- `SUPABASE_*` / `VITE_*` — как на проде (или отдельный staging-проект Supabase)
- `PORT` / `HOST` / `PUBLIC_ORIGIN`
- `GEMINI_*`, `VAPID_*` по необходимости

**True C2 (+ к Hybrid):**

- `DATABASE_URL` — Yandex Managed PostgreSQL (`sslmode=require` обычно уже в URL кабинета)
- Позже: `JWT_SECRET`, `AUTH_PROVIDER=own` — когда включим свой Auth ([AUTH_C2_MAP.md](./AUTH_C2_MAP.md))

### 2. Схема БД (только True C2 / репетиция PG)

```bash
DATABASE_URL=postgres://… npm run db:migrate:pg
# план без БД: npm run db:migrate:pg -- --dry-run
# RLS-файл: npm run db:migrate:pg -- --with-policies
```

Порядок: **`c2_auth_stub.sql`** → `schema.sql` → `supabase/migrations/*.sql` → (опционально) `policies.sql`.

Stub создаёт `auth.users`, `auth.uid()` / `auth.jwt()`, роли `authenticated` / `anon` / `service_role` — иначе миграции с `REFERENCES auth.users` падают на голом Postgres.

По умолчанию **`policies.sql` не применяется** (на C2 опора — наш API, не копия RLS «как на Supabase»). Флаг `--with-policies` — только если осознанно нужны политики на стенде.

Повторный прогон идемпотентен (`_schema_migrations`; stub переприменяется безопасно).

Миграции запускайте **с машины разработчика / CI**, не обязательно из Docker-образа приложения.

### 3. Запуск приложения

```bash
npm ci
npm run build
npm start
# проверка: curl -s http://localhost:8080/api/health
```

Docker:

```bash
docker build \
  --build-arg VITE_SUPABASE_URL=https://xxxx.supabase.co \
  --build-arg VITE_SUPABASE_ANON_KEY=eyJ... \
  -t os-c2 .
docker run --env-file .env -p 8080:8080 os-c2
```

`VITE_*` **вшиваются на build** — runtime env их не подставит в уже собранный `dist`.

Проверка: открыть `PUBLIC_ORIGIN`, `/api/health` → JSON `{ ok: true }`, `/api/auth-sign-in` отвечает JSON (не HTML).

### 4. Smoke

1. Вход: admin, trainer, sales_manager, supervisor.  
2. Планшет: тренировка офлайн → Sync → видно в админке стенда.  
3. `QA_ORIGIN=https://ваш-staging npm run qa` и `npm run qa:roles` (по возможности).

### 5. Auth на C2

Шов готов (`authPort`). **Живой** JWT / хеши паролей — отдельный шаг по [AUTH_C2_MAP.md](./AUTH_C2_MAP.md), в том же окне R2 после живой БД, **не** в ночь cutover клуба.

---

## Чего не делать в этом runbook

- Менять DNS / URL рабочего клуба (это R3).  
- Security-спринт §5.7 и оплаты/кассу.  
- Ломать модель Sync «под хостинг».  
- Считать «migrate:pg прошёл» = «API уже пишет в Yandex PG» — без data-port runtime всё ещё ходит в Supabase.

---

## Откат prep

Удалять `server/` / Docker не обязательно: прод их не вызывает. Откат R2-стенда — выключить контейнер / DNS staging, прод не затронут.
