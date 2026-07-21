# Мои Звонки — клубные SMS

**Статус:** MVP в коде (админка → SMS одному клиенту).  
**Не путать с:** Max у тренера (личный чат) и с номерным Max-шлюзом.

## Зачем

Менеджер / админ из списка клиентов отправляет напоминание (например «абонемент истекает») **SMS с Android-телефона клуба** через API Мои Звонки. Ссылки на чат Max не нужны.

## Что настроить у себя

1. Аккаунт на [moizvonki.ru](https://www.moizvonki.ru/), Android с приложением Мои Звонки онлайн.
2. В приложении на телефоне: **режим отправки SMS без подтверждения** (иначе каждое SMS ждёт тап).
3. В кабинете: **Настройки → Интеграция → Параметры API** — адрес (`https://ВАШ_ДОМЕН.moizvonki.ru/api/v1`) и ключ.
4. **Если ключ попал в чат / скрин — сразу нажмите «Изменить»** и обновите env. Старый ключ перестанет работать.

## Env на сервере (Vercel)

Только serverless, **без** `VITE_`:

| Переменная | Пример |
|------------|--------|
| `MOIZVONKI_DOMAIN` | `fitcity` → base `https://fitcity.moizvonki.ru/api/v1` |
| или `MOIZVONKI_API_BASE` | полный URL `/api/v1` |
| `MOIZVONKI_API_KEY` | ключ из кабинета |
| `MOIZVONKI_USER_EMAIL` | email пользователя Мои Звонки, **с чьего телефона** уйдёт SMS |

После смены env — **Redeploy**.

Локально: те же переменные в `.env` (см. `.env.example`).

## Как пользоваться в FIT-CITY

1. Админка → **Клиенты** (нужен выбранный клуб).
2. Удобно: фильтр «Абонемент ≤ 3 дня».
3. На карточке — иконка **SMS** → уходит шаблон сценария (по умолчанию `expiring`, на фильтре outreach — тот же сценарий).
4. Текст берётся из шаблонов Max-outreach клуба (Структура / ИСКРА), канал — SMS.

Если env не задан, кнопка неактивна, подсказка про настройку.

## API

- `GET /api/admin-data?action=club-sms&club_id=` → `{ configured: true|false }`
- `POST /api/admin-data?action=club-sms` body: `{ club_id, client_id, scenario?, text? }`  
  Роли: admin или sales_manager своего клуба.

Код: `api/_lib/moiZvonkiCore.js`, `moiZvonkiHandler.js`.  
Проверка: `node scripts/verify-moi-zvonki.mjs`.

## Не в MVP

Массовая рассылка, звонок (`calls.make_call`), webhook журнала, кнопка SMS у тренера, Max по номеру.
