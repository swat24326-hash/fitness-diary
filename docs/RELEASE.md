# Чеклист релиза (production)

Продукт **уже в эксплуатации** — один релиз = одна зона изменений. Не смешивать sync, статистику и крупный UI в одном выкладе.

Production: **https://fitness-diary-bice.vercel.app**

## Перед merge в `main`

- [ ] Изменения понятны и минимальны (без «заодно» рефакторинга).
- [ ] Локально: `npm run qa:local` — всё зелёное.
- [ ] Если трогали **sync / очередь / pull**: `verify-sync-offline.mjs`, `verify-sync-unsynced.mjs` + сценарий на планшете (офлайн → запись → Sync).
- [ ] Если трогали **статистику / абонементы**: `verify-club-client-period.mjs`, `verify-club-monthly-year.mjs`, `verify-membership-type-stats.mjs`.
- [ ] Если трогали **SQL / RLS**: миграция в `supabase/migrations/`, обновлён `policies.sql`, план отката SQL записан.
- [ ] CI (GitHub Actions **QA**) на PR — зелёный.

## Деплой на Vercel

```bash
git push origin main
npx vercel --prod --yes
```

- [ ] Деплой в **низкую нагрузку** (не в пик зала, если можно).
- [ ] В Vercel dashboard: **Ready**, alias `fitness-diary-bice.vercel.app`.

## После деплоя (5–10 минут)

- [ ] Открыть prod в браузере — логин, главная тренера/админа без белого экрана.
- [ ] При появлении баннера PWA — обновить на **одном** планшете тестера, убедиться что версия живая.
- [ ] Опционально (раз в неделю или после крупного релиза): `npm run qa` — prod smoke (не гонять на каждый мелкий коммит).

## Откат

1. Vercel → Deployments → предыдущий **Production** → Promote to Production.  
2. Или `git revert` + push + `vercel --prod`.  
3. Если меняли БД — откат только по заранее подготовленному SQL (миграции идемпотентны, но данные — нет).

## Не делать в релизе

- Новый `api/*.js` без учёта лимита **12 functions** (Hobby) — расширять `admin-data?action=`.
- `navigate(0)` после Sync, сброс очереди «для починки UI».
- Крупный рефактор `AppHeader`, `TrainingForm`, `syncService`, `dataAccess` без отдельного окна и тестов.

См. также: [RUNBOOK.md](./RUNBOOK.md), [PROJECT_HANDOFF_FOR_AI.md](./PROJECT_HANDOFF_FOR_AI.md).
