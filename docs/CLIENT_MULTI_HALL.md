# Один клиент — абоны ПЗ / ТЗ / АЗ

**Статус:** ✅ фаза 1 в коде; колонка `memberships.hall` накачена на linked (2026-08-10).  
**Зачем:** один человек в клубе = одна CRM-карточка; зал на абонементе, не «второй клиент».

## Канон

| Слой | Правило |
|------|---------|
| `clients` | Один на № карты в клубе. `trainer_id` = тренер ПЗ (null, пока только desk). |
| `memberships.hall` | `pz` \| `tz` \| `az`. Правила «жив»: ПЗ/АЗ — срок+остаток; ТЗ — календарь. |
| Списки | Клиент во **всех** вкладках/фильтрах, где есть абон этого зала. |
| Поиск | При тексте в поиске (ФИО / карта / телефон) — **по всему клубу**, без фильтра вкладки ПЗ/ТЗ/АЗ; в выдаче стек блоков только по залам, где есть абон. Архив — только на вкладке Архив. |
| Планшет тренера | Только ПЗ (`trainer_id = я`). ТЗ/АЗ — admin / менеджер / управляющий. |
| Оплаты / закрытия / ПНК | Match карты → **дописать** абон / attach, не второй `clients`. |
| Холодный create ПЗ тренером | Флаг «уже в базе — к администратору». |
| Отказ ПНК | Не удалять карточку, если есть ТЗ/АЗ или иная не-ПНК история. |

## Матрица путей

| Путь | При существующей карте |
|------|------------------------|
| Создание ПНК | Авто-attach на того же client |
| Оформление ДК | membership `hall=pz` на той же карточке |
| Оплаты / desk-закрытия | Add membership нужного hall |
| Холодный create тренера | Флаг к админу |
| Клип / lite (менеджер) | Attach |
| Отказ ПНК | Снять ПНК+БЗ; сохранить ТЗ/АЗ |

## Код

- Поле: `memberships.hall` — миграция `20260810140000_memberships_hall.sql`  
  Накатить: `npm run db:migrate:memberships-hall -- --linked`
- Чистая логика: `src/lib/membershipHallCore.js`, `clientHallTabsCore.js`, `pnkCreateAttachCore.js`
- Списки: `deskHallClientsCore.js` (+ memberships)
- Поиск: `adminClientsCrossHallSearchCore.js`, UI `AdminClientHallStack.jsx`; verify `verify-admin-clients-cross-hall-search.mjs`
- Оплаты: `salesPaymentsLinkCore.js` / `salesPaymentsLinkApplyService.js`
- Карточка: `AdminMultiHallClientCardSection.jsx` — вкладки ПЗ/ТЗ/АЗ **всегда** для admin / менеджер / управляющий (дописать абон другого зала без второй карточки); тренер планшета — только свой ПЗ. На вкладке **ПЗ** у клиента с планшетным тренером — те же разделы, что у тренера (здоровье, питание, ДЗ, абоны, тренировки, статистика); у lite (тренер без планшета) — только учёт абонов. ТЗ/АЗ — desk-учёт. На абонах ПЗ у админа/менеджера — **цена пакета** (`paid_amount`, мост до [PAYMENTS_DOMAIN.md](./PAYMENTS_DOMAIN.md)).
- Verify: `scripts/verify-membership-hall.mjs`, `scripts/verify-membership-paid-amount.mjs`

## KPI

Не складывать длины вкладок ПЗ+ТЗ+АЗ как «число людей клуба». Матрицы продаж — по залу абона/оплаты.

## Связанное

[DATA_MODEL.md](./DATA_MODEL.md), [PNK_FUNNEL.md](./PNK_FUNNEL.md), [PZ_CLIENTS_ONBOARD.md](./PZ_CLIENTS_ONBOARD.md), [SALES_MANAGER.md](./SALES_MANAGER.md).
