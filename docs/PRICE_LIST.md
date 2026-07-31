# Прайс клуба (ПЗ + ТЗ)

**Актуально:** 2026-07-31  
**Статус:** ✅ ПЗ (админ + менеджер) · ✅ ТЗ (импорт Excel, правка, облако, печать/PNG).

## Ситуация → польза

На ресепшене нужен актуальный прайс **персонального** и **тренажёрного** зала своего клуба. ПЗ — сетка карт; ТЗ — пакеты 1 мес и акции на несколько месяцев (эталон Excel `1kfs_TZ_*.xls`).

## Где в UI

| Роль | Где |
|------|-----|
| Админ | `/admin/sales?tab=price` — переключатель **ПЗ \| ТЗ** |
| Менеджер | `/sales?tab=price` — то же для своего клуба |

## ПЗ (персональный)

| Правило | Смысл |
|---------|--------|
| Эталон карт | `membership_types` ПЗ (`code`); **без БЗ**; VIP — колонка |
| Режимы | `base` и `day`; ячейка **базовая** и **−10%** |
| Облако | `club_price_lists` · `action=price-list` |

Код ПЗ: `src/lib/priceList/priceList*.js`, UI `AdminPriceListSection.jsx`. Verify: `verify-price-list.mjs`.

## ТЗ (тренажёрный)

Эталон: `scripts/fixtures/tz-price-1kfs.xls`.

| Блок | Смысл |
|------|--------|
| **1 месяц** | 8 / 10 / без лимита × база (полный день) и дневная; полная цена, стенд, экономия |
| **Акции** | 1…12 мес без лимита: база, акция, экономия, ₽/мес |
| Подвал | разовое, клубная карта, «цены с» |
| Облако | `club_tz_price_lists` · `action=tz-price-list` |
| Импорт | кнопка **Excel** на вкладке ТЗ |

Код ТЗ: `tzPriceListCore.js`, `tzPriceListExcel*.js`, `tzPriceListPrint*.js` / `tzPriceListExportCanvas.js`, UI `AdminTzPriceListSection.jsx` + `PriceListHallShell.jsx`.  
Миграция: `npm run db:migrate:tz-price-list -- --linked`.  
Verify: `scripts/verify-tz-price-list.mjs`, `scripts/verify-tz-price-list-print.mjs`.

**Печать / PNG** — все заполненные листы («1 месяц», «Акции»), A4 альбом, гамма тренера, шапка/подвал из Excel. Пустой документ — toast «Сначала загрузите Excel…».

**Дизайн витрины** — общий с ПЗ: `card` + `price-list__*` (шапка стенда, mode-btn, матрица, легенда, акцент колонки стенда/акции). Доп. классы ТЗ — только в `tz-price-list.css`.

## Дальше

| Шаг | Что | Статус |
|-----|-----|--------|
| P4 | Стратегия / ПЗ ДК | ✅ |
| **T1** | Прайс ТЗ: модель + Excel + Save | ✅ |
| **T2** | Печать / PNG ТЗ | ✅ |
| **T3** | Кабинет клиентов ТЗ | ⏸ после прайса |

Связано: [SALES_MANAGER.md](./SALES_MANAGER.md), [API.md](./API.md).
