# Выкладка в интернет

**Актуально:** 2026-11-16.

Прод — **https://app-core.ru**: Yandex VM (Node `server/` + Caddy) + Managed PostgreSQL, свой Auth.  
Релизный чеклист: [RELEASE.md](./RELEASE.md). Устройство контура: [R3_NIGHT.md](./R3_NIGHT.md), [R3_DOMAIN.md](./R3_DOMAIN.md). Стенд с нуля: [R2_C2_STAGING_RUNBOOK.md](./R2_C2_STAGING_RUNBOOK.md).

В браузере данные дублируются в **IndexedDB**; без URL/ключа в `.env` — локальный демо-режим.

---

## A. Прод и стенд (текущий путь)

### 1. Что нужно

- Доступ по SSH к ВМ (`fd_agent_staging` / операционный ключ клуба).
- **Node.js** 20 LTS локально для сборки и QA.
- Env на ВМ: `DATABASE_URL`, `AUTH_PROVIDER=own`, `DATA_BACKEND=pg`, `PUBLIC_ORIGIN=https://app-core.ru`, JWT/VAPID/ИСКРА — см. `.env.example` и [PROJECT_HANDOFF_FOR_AI.md](./PROJECT_HANDOFF_FOR_AI.md) §4.

### 2. Миграции БД (до кода)

Имена файлов в `supabase/migrations/` исторические; накат на Managed PG:

```bash
# на ВМ, до deploy-vm:
sudo bash scripts/r2-pg-migrate-vm.sh
```

Локально/стенд: `npm run db:migrate:pg` — см. [R2_C2_STAGING_RUNBOOK.md](./R2_C2_STAGING_RUNBOOK.md).

### 3. Выкладка кода

Обычный путь — **через тестовый стенд** ([RELIABILITY_PLAN.md](./RELIABILITY_PLAN.md) 2c): стенд собрал и проверил → прод берёт готовую сборку.

```bash
git push origin main
# SSH → на ВМ:
cd /opt/fitness-diary && sudo bash scripts/deploy-vm.sh origin/main
```

`scripts/r3-deploy-vm.sh` — только если стенд недоступен.  
`npx vercel --prod` — **не использовать** (проект Vercel удалён 27.10.2026, R4).

### 4. После выкладки

- HTTPS: открыть https://app-core.ru — вход, главная тренера/админа.
- PWA: при баннере — **Обновить** на планшете ([RUNBOOK.md](./RUNBOOK.md) §4, [PWA.md](./PWA.md)).
- **Помощь → Диагностика → Сборка** — id сборки сменился.
- Безопасность: [PROD_SECURITY_CHECKLIST.md](./PROD_SECURITY_CHECKLIST.md).

### 5. Если что-то не работает

| Симптом | Что проверить |
|---------|----------------|
| Белый экран / старая версия | SW / баннер PWA; [RUNBOOK.md](./RUNBOOK.md) §4 |
| 401 / «войдите снова» | JWT, `AUTH_PROVIDER=own`, часы ВМ; [INCIDENTS.md](./INCIDENTS.md) **Q** |
| Sync «с замечаниями» | Очередь в «Помощи», миграции до кода, [SYNC.md](./SYNC.md) |
| API 404 | Сервис `os-hybrid`, Caddy → Node; `/api/health` |

Каталог API: [API.md](./API.md). Схема: `supabase/schema.sql` + `supabase/migrations/` (накат на PG — выше).

---

## B. Архив: Vercel + Supabase (до 01.10.2026)

> **Не применять к прод.** Ниже — как поднимали старый контур и как гонять **локальное демо** с облачным PostgREST/Auth стороннего проекта, если понадобится. Боевой клуб на этом пути не живёт.

### B1. Что готовили

- Аккаунт Supabase + хостинг Vercel (serverless `api/`).
- Env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`; сервер: `SUPABASE_SERVICE_ROLE_KEY`.

### B2. База

1. SQL Editor: `supabase/schema.sql`, затем миграции из `supabase/migrations/`.
2. Или `supabase link` + `supabase db push`.
3. RLS: `supabase/policies.sql` (`npm run db:migrate` после link). Чеклист старого контура: [SUPABASE_PROD_CHECKLIST.md](./SUPABASE_PROD_CHECKLIST.md).

### B3. Auth URL

В Supabase: Site URL / Redirect URLs = адрес сайта (раньше `*.vercel.app`).

### B4. API на Vercel

| Действие | Endpoint |
|----------|----------|
| Создать тренера | `POST /api/create-trainer` |
| Удалить тренера | `POST /api/admin-data?action=delete-trainer` |

Лимит Hobby ≤12 `api/*.js` на том контуре действовал; на ВМ — нет. Edge `supabase/functions/*` для прода не нужны.

### B5. Локальная сборка (демо)

```bash
npm ci
cp .env.example .env
npm run build
npm run preview
```

Статический хостинг без Node `api/` (чистый Netlify/Pages) — только UI-демо, без push/pull и создания тренера.

Краткая шпаргалка эпохи Supabase: [SUPABASE_FIRST_DEPLOY.md](./SUPABASE_FIRST_DEPLOY.md).
