# Объём данных и пороги (Supabase / IndexedDB)

Использовать **до** подключения клуба с тысячами тренировок или при жалобах на медленный Sync / статистику.

## Быстрая оценка в SQL Editor (prod)

Подставьте `club_id` (UUID из Table Editor или из диагностики админа).

```sql
-- Клиенты клуба
SELECT count(*) AS clients
FROM public.clients
WHERE club_id = '00000000-0000-0000-0000-000000000000';

-- Абонементы (через клиентов)
SELECT count(*) AS memberships
FROM public.memberships m
JOIN public.clients c ON c.id = m.client_id
WHERE c.club_id = '00000000-0000-0000-0000-000000000000';

-- Тренировки клуба (все статусы)
SELECT count(*) AS trainings
FROM public.trainings t
JOIN public.clients c ON c.id = t.client_id
WHERE c.club_id = '00000000-0000-0000-0000-000000000000';

-- Завершённые за последний год (нагрузка на годовой график)
SELECT count(*) AS completed_last_year
FROM public.trainings t
JOIN public.clients c ON c.id = t.client_id
WHERE c.club_id = '00000000-0000-0000-0000-000000000000'
  AND t.status = 'completed'
  AND t.date >= (current_date - interval '1 year')::text;

-- Размер по месяцам (тренировки)
SELECT date_trunc('month', t.date::date) AS month, count(*) AS n
FROM public.trainings t
JOIN public.clients c ON c.id = t.client_id
WHERE c.club_id = '00000000-0000-0000-0000-000000000000'
  AND t.status = 'completed'
GROUP BY 1
ORDER BY 1 DESC
LIMIT 24;
```

Глобально (все клубы):

```sql
SELECT
  (SELECT count(*) FROM public.clubs) AS clubs,
  (SELECT count(*) FROM public.clients) AS clients,
  (SELECT count(*) FROM public.trainings) AS trainings,
  (SELECT count(*) FROM public.memberships) AS memberships;
```

## Ориентиры (эмпирические, один зал)

| Метрика | Комфортно сейчас | Зона внимания | Действия |
|---------|------------------|---------------|----------|
| Тренировок на клуб | &lt; 20k | 20k–80k | профилировать pull; план pull по периоду (фаза 4) |
| Клиентов на клуб | &lt; 2k | &gt; 5k | индексы `clients(club_id)`; не тянуть лишнее в админ-списки |
| Очередь sync на планшете | 0–50 pending | &gt; 200 | RUNBOOK §1; poison queue |
| Размер IDB (Chrome DevTools → Application) | &lt; 50 MB | &gt; 150 MB | prune старых черновиков; pull по окну |

Точные лимиты зависят от планшета и сети клуба — таблица для **триажа**, не SLA.

## IndexedDB на планшете тренера

1. Chrome → F12 → **Application** → IndexedDB → `fitness-diary` (имя из `localDb.js`).
2. Stores: `trainings`, `clients`, `memberships`, `sync_queue`.
3. После **Sync** сравнить `count` trainings с SQL `completed` за тот же период (не 1:1 из-за черновиков и фильтра клуба).

## Когда включать фазу 4 (pull по периоду)

- Полный `trainer-pull` &gt; 30–60 с на стабильном Wi‑Fi **или**
- Статистика клуба на API таймаутится (&gt; 10 s на `admin-data?action=club-stats`) **и**
- SQL показывает &gt; 50k тренировок на клуб.

До этого — оптимизировать запросы в `api/lib/*Agg.js`, не менять контракт офлайн-кэша.

## Регресс цифр

После правок агрегации:

```bash
npm run qa:local
```

Скрипт `verify-stats-agg-parity.mjs` сравнивает `api/lib/*Agg.js` и `src/lib/admin/*Agg.js` на одних фикстурах.
