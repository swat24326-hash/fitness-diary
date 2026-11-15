# Переход на платные тарифы (архив US SaaS)

**Статус:** 🗄 **архив** (2026-11-16). Прод на Yandex VM + Managed PG с 01.10; Vercel/Supabase сняты в R4 (27.10). Апгрейд Hobby→Pro **не актуален**. Ёмкость и надёжность сейчас — [CAPACITY_PLAN.md](./CAPACITY_PLAN.md), [RELIABILITY_PLAN.md](./RELIABILITY_PLAN.md), [STRATEGY_SCALE_AND_RU_HOSTING.md](./STRATEGY_SCALE_AND_RU_HOSTING.md).

Ниже — памятка эпохи Free tier. **Не оплачивать** и не применять к текущему прод.

---

Документ-памятка (исторически). **Не оплачивать заранее** — только когда объём клуба упирался в лимиты free tier.

Если цель была **данные и API в РФ** — см. [STRATEGY_SCALE_AND_RU_HOSTING.md](./STRATEGY_SCALE_AND_RU_HOSTING.md): свой хостинг снимал лимит Vercel Hobby без апгрейда Pro.

## Когда пора

- Стабильные `ERR_CONNECTION_RESET` / таймауты Supabase в часы пик.
- >500 MB БД или частые предупреждения о квотах в Dashboard.
- Нужны **ежедневные бэкапы** и SLA для договора с клубом.
- Нужно >12 serverless functions на Vercel или длинные push-batch.

## Vercel (Hobby → Pro)

| | Hobby (сейчас) | Pro |
|---|----------------|-----|
| Serverless functions | **12** | больше |
| Таймаут push-records | 60s (настроено) | можно увеличить |
| Команда / preview | базово | удобнее для QA |

**Действия:** апгрейд проекта → проверить, что все 12 `api/*.js` на месте → не плодить новые endpoints.

## Supabase (Free → Pro)

| | Free | Pro |
|---|------|-----|
| Бэкапы | ограничены | point-in-time |
| Connections | пул | лучше для пиков |
| Support | community | приоритет |

**Действия:**

1. Pro plan на **тот же** project ref (не переносить данные в новый проект без миграции).
2. Проверить RLS после апгрейда (обычно без изменений).
3. Включить бэкапы; записать процедуру восстановления в договор с клубом.

## Свой домен (опционально)

1. Домен в DNS → Vercel.
2. Supabase Auth: Site URL + Redirect URLs на новый домен.
3. PWA: пользователи переустановят/обновят ярлык.

## Чеклист в день перехода

- [ ] `npm run qa` (prod smoke) до переключения трафика.
- [ ] Supabase checklist: [SUPABASE_PROD_CHECKLIST.md](./SUPABASE_PROD_CHECKLIST.md).
- [ ] Сообщить клубу окно обслуживания (15–30 мин) если меняется домен.
- [ ] После — тест Sync на планшете + сравнение **Сборка** в Диагностике.

Код менять не обязательно — в основном биллинг и конфигурация панелей.
