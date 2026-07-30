# Прайс клуба (ПЗ)

**Актуально:** 2026-07-30  
**Статус:** ✅ админ + **облако** (`club_price_lists`). Печать/PNG и UI менеджера — дальше.

## Ситуация → польза

На ресепшене нужен актуальный прайс персонального зала: свои цены на **этот** клуб, одна сетка (карты + VIP), без отдельных Excel. Колонки совпадают с типами абонементов (код `PL`, `VIP`…), а не с маркетинговыми именами из файла.

## Где в UI

Админ → **Продажи** → вкладка **Прайс** (`/admin/sales?tab=price&club=…`).

## Правила

| Правило | Смысл |
|---------|--------|
| Свой прайс на клуб | `club_id`; другой клуб — другая сетка |
| Эталон карт | `membership_types` ПЗ (`code`); **без БЗ**; VIP — обычная колонка |
| Режимы | `base` и `day` — две сетки одних карт |
| Ячейка | **базовая** и **−10%** (как в Excel); правка одной пересчитывает другую |
| Людей | чипы 1…5 — можно только `1` или полный ряд |
| Облако | `GET/POST admin-data?action=price-list`; кэш в localStorage |
| Не путать | цена витрины ≠ ЗП тренера у типа; не в sync планшета |

## Код

| Роль | Путь |
|------|------|
| Модель | `src/lib/priceList/priceListCore.js` |
| DB map | `src/lib/priceList/priceListDbCore.js` |
| Облако | `src/lib/priceList/priceListCloudService.js` |
| Локальный кэш | `src/lib/priceList/priceListLocalStorage.js` |
| API | `api/_lib/adminData/priceListHandlers.js` |
| UI | `src/components/priceList/AdminPriceListSection.jsx` |
| Миграция | `supabase/migrations/20260730120000_club_price_lists.sql` |
| Verify | `scripts/verify-price-list.mjs` |

Применить таблицу: `npm run db:migrate:price-list -- --linked`

## Дизайн витрины (ориентиры)

Не SaaS-карточки «3 тарифа + CTA», а **матрица сравнения** (как rate card / feature matrix):

| Паттерн | Как у нас |
|---------|-----------|
| Sticky оси + шапка | Трен./мес и люди слева; коды карт сверху при скролле |
| Цена крупнее сходств | Колонка **−10%** визуально главная (цена стенда) |
| Выделение тарифа | VIP — badge + лёгкий accent |
| Группы строк | Полосы по блокам тренировок (4 / 8 / 10) |
| Шапка стенда | Адрес / телефон / «цены с» отдельной glass-полосой |
| Скролл | Подсказка «листайте вбок» + мягкий fade справа |

Канон цвета/стекла — [BRAND_SYSTEM.md](./BRAND_SYSTEM.md).

## Дальше (объединённый план с ускорением Продаж)

| Шаг | Что | Статус |
|-----|-----|--------|
| **A** | API `sales&profile=shell\|daily\|month\|full` (+ `include_fit_city`) | ✅ в коде |
| **B** | Клиент: shell для hero; **Прайс/План/Финансы** без daily+fit-city; daily лениво | ✅ в коде |
| **C** | Ещё тоньше month payload / кэш shell | ⏸ |
| **P1** | Импорт xlsx + мастер PL/VIP | ⏸ дальше |
| **P2** | Печать / PNG | ⏸ дальше |
| **P3** | Менеджер: просмотр прайса на `/sales` | ⏸ (API read уже есть) |

Ускорение Продаж **обслуживает Прайс**: вкладка не ждёт полный bundle (memberships+trainings).

Связано: [SALES_MANAGER.md](./SALES_MANAGER.md), [API.md](./API.md).
