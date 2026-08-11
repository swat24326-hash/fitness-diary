# Прайс клуба (ПЗ + ТЗ + АЗ)

**Актуально:** 2026-08-11  
**Статус:** ✅ ПЗ · ✅ ТЗ (импорт, типовая сетка, облако, печать/PNG) · ✅ АЗ (импорт, типовая сетка, облако, печать/PNG).

## Ситуация → польза

На ресепшене нужен актуальный прайс **персонального**, **тренажёрного** и **аэробного** зала своего клуба.

## Где в UI

| Роль | Где |
|------|-----|
| Админ | `/admin/sales?tab=price` — **ПЗ \| ТЗ \| АЗ** |
| Менеджер | `/sales?tab=price` — то же для своего клуба |

## ПЗ (персональный)

| Правило | Смысл |
|---------|--------|
| Эталон карт | `membership_types` ПЗ (`code`); **без БЗ**; VIP — колонка; переименование code в «Типы абон.» подхватывается при синхронизации колонок прайса (`syncTariffsFromMembershipTypes`) |
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
| Структура без Excel | **Типовая сетка** (8 / 10 / без лимита + акции 1–12), добавить/удалить строку, правка срока и занятий, часы базы/дня |

Код ТЗ: `tzPriceListCore.js`, `tzPriceListExcel*.js`, `tzPriceListPrint*.js` / `tzPriceListExportCanvas.js`, UI `AdminTzPriceListSection.jsx` + `PriceListHallShell.jsx`.  
Миграция: `npm run db:migrate:tz-price-list -- --linked`.  
Verify: `scripts/verify-tz-price-list.mjs`, `scripts/verify-tz-price-list-print.mjs`.

**Печать / PNG** — все заполненные листы («1 месяц», «Акции»), A4 альбом, гамма тренера, шапка/подвал из Excel.

## АЗ (аэробный / групповые)

Эталон: `scripts/fixtures/az-price-1kfs.xlsx`.

| Блок | Смысл |
|------|--------|
| **Результат** | Результат1+ / 2+ / 3+ × 4 / 8 / 10 тр.; полная и −10% |
| **Групповые** | Йога / Бокс / Степ × те же сессии |
| **Доплаты** | вечерняя доплата ПТ + прочие (карта, ключ…) |
| Extras стенда | Результат+ (730), разовое Результат+ (750) |
| Облако | `club_az_price_lists` · `action=az-price-list` |
| Импорт | кнопка **Excel** на вкладке АЗ |
| Структура без Excel | **Типовая сетка** (Результат1+/2+/3+, Йога/Бокс/Степ, 4/8/10), направления и строки занятий, доплаты; полная ↔ −10% как у ПЗ |

Код: `azPriceListCore.js`, `azPriceListExcel*.js`, `azPriceListPrint*.js` / `azPriceListExportCanvas.js`, UI `AdminAzPriceListSection.jsx`.  
Миграция: `npm run db:migrate:az-price-list -- --linked`.  
Verify: `scripts/verify-az-price-list.mjs`, `scripts/verify-az-price-list-print.mjs`.

**Печать / PNG** — все заполненные листы (Результат, Групповые, Доплаты), A4 альбом, та же гамма тренера и ритуал кнопок, что у ПЗ/ТЗ.

**Дизайн витрины** — общий: `card` + `price-list__*`. Доп. классы АЗ — `az-price-list.css`.

## Дальше

| Шаг | Что | Статус |
|-----|-----|--------|
| P4 | Стратегия / ДК ПЗ·ТЗ·АЗ (конец месяца × ср. покупок) | ✅ |
| **T1** | Прайс ТЗ: модель + Excel + Save | ✅ |
| **T2** | Печать / PNG ТЗ | ✅ |
| **A1** | Прайс АЗ: модель + Excel + Save | ✅ |
| **A2** | Печать / PNG АЗ | ✅ |
| **T3** | Кабинет клиентов ТЗ | ⏸ после прайса |

Связано: [SALES_MANAGER.md](./SALES_MANAGER.md), [API.md](./API.md).
