# FIT-CITY — дневник тренировок

Фронт: **Vite + React** (PWA). Бэкенд: **Supabase** (Postgres, Auth) + **Vercel** serverless (`api/`).

## Документация

- **[docs/README.md](docs/README.md)** — карта всей документации
- **[docs/PROJECT_HANDOFF_FOR_AI.md](docs/PROJECT_HANDOFF_FOR_AI.md)** — полный контекст для нового чата / разработчика
- **[docs/API.md](docs/API.md)** · **[docs/SYNC.md](docs/SYNC.md)** · **[docs/TESTING.md](docs/TESTING.md)** · **[docs/PWA.md](docs/PWA.md)**
- **[CONTRIBUTING.md](CONTRIBUTING.md)** · **[CHANGELOG.md](CHANGELOG.md)**
- **[docs/DEPLOY.md](docs/DEPLOY.md)** — первый выклад; кратко: [docs/SUPABASE_FIRST_DEPLOY.md](docs/SUPABASE_FIRST_DEPLOY.md)

## Быстрый старт локально

```bash
npm install
cp .env.example .env
# VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY (JWT eyJ…)
npm run dev
```

Без Supabase в `.env` — демо-режим (логин admin или тренер без облака).

## Скрипты

| Команда | Назначение |
|---------|------------|
| `npm run dev` | Разработка |
| `npm run build` / `preview` | Production-сборка / просмотр |
| `npm run lint` | ESLint — перед «готово» |
| `npm run qa:local` | build + verify + lint (без prod smoke) |
| `npm run qa` | + prod smoke |
| `npm run db:migrate` | Применить `supabase/policies.sql` (после `supabase link`) |
| `npm run db:migrate:pnk` / `sales` / `iskra` / … | Целевые миграции фич |

Полный чеклист релиза: [docs/RELEASE.md](docs/RELEASE.md). Инциденты: [docs/RUNBOOK.md](docs/RUNBOOK.md).

## Первый выклад

Пошагово: **[docs/DEPLOY.md](docs/DEPLOY.md)** (схема, RLS, env на Vercel, Auth URL, Edge Functions).  
Production: https://fitness-diary-bice.vercel.app
