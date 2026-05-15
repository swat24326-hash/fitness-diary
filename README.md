# FIT-CITY — дневник тренировок

Фронт: **Vite + React** (PWA). Бэкенд: **Supabase** (Postgres, Auth, Edge Functions).

## Документация

- **[docs/DEPLOY.md](docs/DEPLOY.md)** — первый выклад в интернет (Supabase, хостинг, env).
- **[docs/PROJECT_HANDOFF_FOR_AI.md](docs/PROJECT_HANDOFF_FOR_AI.md)** — подробное описание проекта для передачи другой нейросети или разработчику.

## Быстрый старт локально

```bash
npm install
cp .env.example .env
# укажите VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY
npm run dev
```

## Первый выклад в интернет

Пошаговая инструкция: **[docs/DEPLOY.md](docs/DEPLOY.md)** (Supabase, переменные, хостинг, Auth URL, Edge Functions).

## Первый деплой (RLS + Vercel)

### 1. Supabase: схема и данные

1. Создайте проект на [supabase.com](https://supabase.com).
2. В **SQL Editor** выполните **`supabase/schema.sql`**, затем по очереди файлы из **`supabase/migrations/`** (как в [docs/DEPLOY.md](docs/DEPLOY.md)).

### 2. Row Level Security (обязательно до продакшена)

Политики для таблиц **clients**, **trainings**, **memberships**, **health_cards**, **body_measurements** описаны в **`supabase/policies.sql`** (админ — полный доступ; тренер — только свой клуб и свои клиенты/тренировки).

**Через CLI** (нужны [Supabase CLI](https://supabase.com/docs/guides/cli/getting-started) и связка с проектом):

```bash
supabase login
supabase link --project-ref <ваш_project_ref>
npm run db:migrate
```

Команда `db:migrate` выполняет `supabase db query --linked --file supabase/policies.sql` на **привязанный** удалённый проект. Без `supabase link` команда завершится с ошибкой.

**Без CLI:** откройте **`supabase/policies.sql`** в редакторе и выполните целиком в **SQL Editor** в Dashboard.

Другие таблицы (`users`, `clubs`, `exercises`, `challenges` и т.д.) в этом файле **не** настраиваются — при необходимости допишите политики отдельно (см. также `supabase/policies_admin_example.sql` как черновик).

### 3. Переменные окружения

В **Vercel** → Project → **Settings → Environment Variables** добавьте:

- `VITE_SUPABASE_URL` — из Supabase **Settings → API → Project URL**
- `VITE_SUPABASE_ANON_KEY` — **anon public** (не service_role)

Сохраните для окружений **Production** (и при необходимости Preview). После изменения переменных выполните **новый деплой** — Vite вшивает `VITE_*` в клиент на этапе сборки.

### 4. Vercel

- Подключите репозиторий или задеплойте каталог с этим проектом.
- **Build Command:** `npm run build`
- **Output Directory:** `dist`
- Файл **`vercel.json`** уже настроен на SPA (fallback на `index.html`).

### 5. Auth и функции

В Supabase задайте **Site URL** и **Redirect URLs** под домен Vercel (и `http://localhost:5173` для разработки). Задеплойте Edge Functions **`create-trainer`** и **`delete-trainer`**, если пользуетесь созданием тренеров из админки (см. [docs/DEPLOY.md](docs/DEPLOY.md)).

## Скрипты

| Команда | Назначение |
|---------|------------|
| `npm run dev` | Разработка |
| `npm run build` | Продакшен-сборка → `dist/` |
| `npm run preview` | Просмотр сборки локально |
| `npm run lint` | ESLint |
| `npm run db:migrate` | Применить **`supabase/policies.sql`** к связанному Supabase-проекту (после `supabase link`) |
