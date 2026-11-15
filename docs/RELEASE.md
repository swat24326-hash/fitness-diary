# Чеклист релиза (production)

**Актуально:** 2026-11-16.

Продукт **уже в эксплуатации** — один релиз = одна зона изменений. Не смешивать sync, статистику и крупный UI в одном выкладе.

Production: **https://app-core.ru**  
**Хостинг:** Yandex Cloud — ВМ (Node `server/` + Caddy) + Managed PostgreSQL; свой Auth (`AUTH_PROVIDER=own`, `DATA_BACKEND=pg`).  
R3 cutover 01.10.2026; **R4 ✅** — Supabase и проект Vercel сняты (27.10). Старый `*.vercel.app` не использовать.  
Детали контура: [R3_NIGHT.md](./R3_NIGHT.md), [PROJECT_HANDOFF_FOR_AI.md](./PROJECT_HANDOFF_FOR_AI.md). Безопасность прода: [PROD_SECURITY_CHECKLIST.md](./PROD_SECURITY_CHECKLIST.md).

В чате **«заливай»** = весь цикл сразу (коммит → push → стенд → прод), без вопросов по шагам — правило `fitness-diary-ship.mdc`.

## Перед merge в `main`

- [ ] Изменения понятны и минимальны (без «заодно» рефакторинга).
- [ ] Локально: `npm run qa:local` — всё зелёное (или `npm run qa:critical`, если зона узкая — sync/complete/абон/главная).
- [ ] Если трогали **sync / очередь / pull**: `verify-sync-offline.mjs`, `verify-sync-unsynced.mjs` + сценарий на планшете (офлайн → запись → Sync).
- [ ] Если трогали **статистику / абонементы**: `verify-club-client-period.mjs`, `verify-club-monthly-year.mjs`, `verify-membership-type-stats.mjs`, `verify-stats-agg-parity.mjs`.
- [ ] Если трогали **SQL / RLS**: миграция в `supabase/migrations/` (имя историческое; накат на PG — `scripts/r2-pg-migrate-vm.sh` **до** кода), эталон политик в репо, план отката SQL записан.
- [ ] CI (GitHub Actions **QA**) на PR — зелёный.
- [ ] Безопасность / auth / устройства: [PROD_SECURITY_CHECKLIST.md](./PROD_SECURITY_CHECKLIST.md). Старый контур: [SUPABASE_PROD_CHECKLIST.md](./SUPABASE_PROD_CHECKLIST.md) (архив до R4).

## Деплой на ВМ (прод)

Обычный путь — **через тестовый стенд** (собрал и проверил стенд → прод берёт готовую сборку): [RELIABILITY_PLAN.md](./RELIABILITY_PLAN.md) 2c.

```bash
git push origin main
# SSH на ВМ (ключ fd_agent_staging), затем:
# при новых миграциях — сначала:
#   sudo bash scripts/r2-pg-migrate-vm.sh
cd /opt/fitness-diary && sudo bash scripts/deploy-vm.sh origin/main
```

`scripts/r3-deploy-vm.sh` — **только аварийно**, если стенд лежит.  
`vercel --prod` — **не нужен** (проект удалён в R4).

- [ ] Деплой в **низкую нагрузку** (не в пик зала, если можно).
- [ ] Сервис `os-hybrid` / Caddy живы; `/api/health` отвечает.

## После деплоя (5–10 минут)

- [ ] Открыть **https://app-core.ru** — логин, главная тренера/админа без белого экрана.
- [ ] При появлении баннера PWA — **Обновить** на тестовом планшете (см. RUNBOOK §4).
- [ ] **Помощь → Диагностика**: поле **Сборка** — после деплоя id должен измениться.
- [ ] После крупного релиза локально: `npm run qa` (prod smoke), если доступен.
- [ ] Регресс на проде → запись в [INCIDENTS.md](./INCIDENTS.md) (агент или владелец в чате).

## Откат

1. Предыдущий успешный деплой на ВМ (тот же `deploy-vm.sh` на известный хороший ref / откат через стенд — см. [RELIABILITY_PLAN.md](./RELIABILITY_PLAN.md), [R3_NIGHT.md](./R3_NIGHT.md)).
2. Или `git revert` + push + снова `deploy-vm.sh`.
3. Если меняли БД — откат только по заранее подготовленному SQL (миграции идемпотентны, но данные — нет).

## Не делать в релизе

- `vercel --prod` / деплой на старый US-контур.
- Плодить новый `api/*.js` без нужды — по возможности расширять `admin-data?action=` (привычка портативности; лимит Hobby больше не действует).
- `navigate(0)` после Sync, сброс очереди «для починки UI».
- Крупный рефактор `AppHeader`, `TrainingForm`, `syncService`, `dataAccess` без отдельного окна и тестов.

См. также: [AGENT_PLAYBOOK.md](./AGENT_PLAYBOOK.md), [DEPLOY.md](./DEPLOY.md), [RUNBOOK.md](./RUNBOOK.md), [INCIDENTS.md](./INCIDENTS.md), [PROD_SECURITY_CHECKLIST.md](./PROD_SECURITY_CHECKLIST.md), [PROJECT_HANDOFF_FOR_AI.md](./PROJECT_HANDOFF_FOR_AI.md).
