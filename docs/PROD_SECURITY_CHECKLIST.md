# Чеклист безопасности прода (РФ-контур, app-core.ru)

**Актуально:** 2026-10-07  
**Кому:** разработчику / агенту после деплоя, который трогал вход, push, API или сервер; перед подключением нового клуба; раз в квартал.  
**Контур:** ВМ Yandex Cloud (`/opt/fitness-diary`, сервис `os-hybrid` за Caddy) + Managed PG, свой Auth. Как устроено — [R3_NIGHT.md](./R3_NIGHT.md); решения и история аудитов — [STRATEGY §5.7](./STRATEGY_SCALE_AND_RU_HOSTING.md). Старый [SUPABASE_PROD_CHECKLIST.md](./SUPABASE_PROD_CHECKLIST.md) — до выключения Supabase в R4.

Все проверки — только чтение и выдуманные логины. Настоящие учётки и данные клубов не трогать.

## 1. Из репозитория (до деплоя)

| Что | Как | Статус 07.10 |
|-----|-----|--------------|
| Лимит перебора пароля, обход через `X-Forwarded-For` | `verify-auth-rate-limit` | ✅ |
| Тренер / управляющий не пишет в чужой клуб (в т.ч. челленджи) | `verify-push-club-binding` | ✅ |
| Ошибки базы без значений строк, адреса и логина БД | `verify-api-error-sanitize` | ✅ |
| Новая таблица без RLS | `verify-rls-coverage` | ✅ |
| Заголовки и боевая CSP | `verify-portable-host-security` | ✅ |

Всё входит в `npm run qa:local`.

## 2. На проде снаружи (после деплоя)

Последний прогон: 07.10 после `092d453` — всё ✅ (`/rest/v1` → `[]`, insert и `/api/*` → 401, 10× 401 + 11-й 429, `.env` → `index.html`, CSP / HSTS / `DENY`).

- [ ] `/rest/v1/clients` без токена → `[]`; insert без токена → 401.
- [ ] `/api/push-record`, `/api/trainer-pull`, `/api/admin-data` без токена → 401.
- [ ] 11× вход выдуманным логином `qa-rl-probe-<дата>` с разными `X-Forwarded-For` → 10× 401, 11-й **429**.
- [ ] Ответ на неверный пароль одинаков для настоящего и выдуманного логина.
- [ ] `/.env`, `/.git/config` → отдаётся `index.html`, не файл.
- [ ] Заголовки ответа: HSTS, `X-Frame-Options`, `Content-Security-Policy` (не `-Report-Only`).

## 3. На ВМ

- [ ] `grep header_up /etc/caddy/Caddyfile` — строка с `X-Forwarded-For {remote_host}` есть.
- [ ] Группа безопасности ВМ — только 22 / 80 / 443 (+ Self для PG).
- [ ] Секреты только в `/opt/fitness-diary/.env` на ВМ, не в репо и не в `VITE_*`.
- [ ] `journalctl -u os-hybrid --since "1 hour ago"` — нет всплеска `[push-auth]`, `[pg …]`, 5xx. Сырой текст ошибок базы ищите здесь: в ответы клиенту он не уходит.

## 4. Осознанно отложено

Привязка планшетов (ждёт команды), CORS только свой домен (после R4), MFA админов, белый список колонок абонемента в push (при уходе с 1С). Подробности — STRATEGY §5.7.
