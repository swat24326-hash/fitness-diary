# Ядро (fitness-diary)

PWA для фитнес-клуба: планшет тренера (офлайн), админка, продажи, управляющий, приложения `/coach` и `/me`.

**Прод:** https://app-core.ru — Yandex Cloud (ВМ + Managed PostgreSQL, свой Auth).  
Фронт: **Vite + React**. API: папка `api/` на Node-хосте `server/`. Имена `supabase*` в репо — исторические (SQL накатывается на PG).

## Документация

- **[docs/README.md](docs/README.md)** — карта всей документации
- **[docs/AGENT_PLAYBOOK.md](docs/AGENT_PLAYBOOK.md)** — маршрут для агента Cursor (новый чат)
- **[docs/PROJECT_HANDOFF_FOR_AI.md](docs/PROJECT_HANDOFF_FOR_AI.md)** — полный контекст для нового чата / разработчика
- **[docs/API.md](docs/API.md)** · **[docs/SYNC.md](docs/SYNC.md)** · **[docs/TESTING.md](docs/TESTING.md)** · **[docs/PWA.md](docs/PWA.md)**
- **[CONTRIBUTING.md](CONTRIBUTING.md)** · **[CHANGELOG.md](CHANGELOG.md)**
- **[docs/DEPLOY.md](docs/DEPLOY.md)** — выкладка на ВМ; **[docs/RELEASE.md](docs/RELEASE.md)** — чеклист релиза

## Быстрый старт локально

```bash
npm install
cp .env.example .env
# VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY (JWT eyJ…) —
# на проде URL = https://app-core.ru; локально можно демо без ключей
npm run dev
```

Без URL/ключа в `.env` — демо-режим (логин admin или тренер без облака).

## Скрипты

| Команда | Назначение |
|---------|------------|
| `npm run dev` | Разработка |
| `npm run build` / `preview` | Production-сборка / просмотр |
| `npm run lint` | ESLint — перед «готово» |
| `npm run qa:local` | build + verify + lint (без prod smoke) |
| `npm run qa` | + prod smoke |
| `npm run db:migrate:pg` / `scripts/r2-pg-migrate-vm.sh` | Миграции на Managed PG (прод/стенд) |

Полный чеклист релиза: [docs/RELEASE.md](docs/RELEASE.md). Инциденты: [docs/INCIDENTS.md](docs/INCIDENTS.md), процедуры: [docs/RUNBOOK.md](docs/RUNBOOK.md).

## Выкладка на прод

Через стенд: `git push origin main` → миграции при необходимости → `cd /opt/fitness-diary && sudo bash scripts/deploy-vm.sh origin/main`.  
Подробно: [docs/DEPLOY.md](docs/DEPLOY.md), [docs/RELEASE.md](docs/RELEASE.md).  
`vercel --prod` не используется (R4, 27.10.2026).
