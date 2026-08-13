# Первый выход в Supabase (кратко)

Шпаргалка на момент, когда вы заведёте проект в [Supabase](https://supabase.com) и подключите приложение к облаку. До этого шаги можно не выполнять — локально клубы живут в IndexedDB.

Полная инструкция: [DEPLOY.md](./DEPLOY.md). **Сейчас** хостинг — Vercel + Supabase; целевой переезд на РФ — [STRATEGY_SCALE_AND_RU_HOSTING.md](./STRATEGY_SCALE_AND_RU_HOSTING.md).

## 1. Проект и переменные в приложении

1. Создайте проект в Supabase (Dashboard).
2. Скопируйте **Project URL** и **anon public** ключ: **Settings → API** (JWT `eyJ…`, не `sb_publishable_…`).
3. В корне репозитория создайте файл `.env` (отталкивайтесь от `.env.example`):

   - `VITE_SUPABASE_URL` — URL проекта  
   - `VITE_SUPABASE_ANON_KEY` — anon key  

4. На **Vercel** (прод) задайте те же `VITE_*` **и** server env: `SUPABASE_SERVICE_ROLE_KEY` (создание тренера, push с service role). Без service role UI упрётся в «нет сервера `/api/create-trainer`».

5. Перезапустите dev-сервер (`npm run dev`), чтобы Vite подхватил переменные. Для локального API — `npm run dev:vercel`.

## 2. Схема базы

В **SQL Editor** в Supabase выполните SQL из репозитория:

- **`supabase/schema.sql`** — полная схема таблиц (если база пустая).
- Затем миграции из **`supabase/migrations/`** по имени файла (идемпотентны).

Если уже используете Supabase CLI: `supabase link` + `supabase db push` / `npm run db:migrate*` — см. [DEPLOY.md](./DEPLOY.md).

## 3. Создание и удаление тренера (`/api/*`)

Админка создаёт тренера через **`POST /api/create-trainer`** (код: `api/create-trainer.js` + `_lib`). Удаление — **`admin-data?action=delete-trainer`** (только если у тренера нет клиентов).

Нужен деплой папки `api/` на Vercel и `SUPABASE_SERVICE_ROLE_KEY` в server env. Каталог: [API.md](./API.md).

Папки `supabase/functions/create-trainer` и `delete-trainer` — **legacy**; для прода Edge деплоить не нужно.

## 4. RLS (политики доступа)

После включения **Row Level Security** на таблицах без политик клиентское приложение не увидит данные. Эталон: **`supabase/policies.sql`** + миграции политик. Чеклист: [SUPABASE_PROD_CHECKLIST.md](./SUPABASE_PROD_CHECKLIST.md).

Черновик идей — в **`supabase/policies_admin_example.sql`**. `public.users.id` должен совпадать с Auth UID.

## 5. Первый админ и тренеры

- Запись **админа** в `public.users` с `role = 'admin'` и `id`, совпадающим с пользователем из **Auth**, обычно делают вручную в SQL.
- Создание тренера из UI после деплоя API: **Структура → Тренеры** → новый тренер; опционально `club_id` (в т.ч. из `?club=`).

## 6. Если что-то пошло не так

- **Тренеры не грузятся** — проверьте RLS на `users`, `.env`, сеть.
- **Нельзя сменить клуб тренеру** — миграция `club_id` и политика `UPDATE` для админа на `users`.
- **Ошибка при создании тренера** — нет деплоя `/api/create-trainer`, нет `SUPABASE_SERVICE_ROLE_KEY`, или вставка в `users` падает из‑за RLS.

---

Локально без Supabase приложение уже работает; этот файл нужен именно на этапе первого подключения к облаку.
