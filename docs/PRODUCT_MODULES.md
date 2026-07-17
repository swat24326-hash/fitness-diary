# Модули продукта (кроме ядра тренировок)

**Актуально:** 2026-07-17. Ядро (клиент / абонемент / тренировка / sync) — handoff и [DATA_MODEL.md](./DATA_MODEL.md). Здесь — соседние контуры, чтобы не искать по репо вслепую.

| Модуль | Статус | Где код | Документ |
|--------|--------|---------|----------|
| **ПНК** | ✅ прод | `src/lib/pnk/`, `components/pnk/`, `api/_lib/adminData/pnkHandlers.js` | [PNK_FUNNEL.md](./PNK_FUNNEL.md) |
| **Продажи** | ✅ прод | `src/lib/admin/sales*`, `AdminSales`, salesHandlers | [SALES_MANAGER.md](./SALES_MANAGER.md) |
| **Питание** | ✅ в карточке | `src/lib/nutrition/*`, store `nutrition_products` | вкладка «Питание»; push в allowlist |
| **ДЗ (домашние)** | ✅ в карточке | `src/lib/homework/*`, store `homework_presets` | вкладка «ДЗ»; push в allowlist |
| **Max / outreach** | Max ✅; SMS ⏸ | `outreach_log`, фильтры тренера | [OUTREACH_CHANNELS_ROADMAP.md](./OUTREACH_CHANNELS_ROADMAP.md) |
| **ИСКРА** | ✅ прод | `api/_lib/gemini*`, `iskra*`, UI админки | `ISKRA_*.md`, [iskra-kb/](./iskra-kb/README.md) |
| **Планёрка / dispatch** | ✅ прод | iskra-dispatch + push | [ISKRA_PLANERKA.md](./ISKRA_PLANERKA.md), [PUSH_SETUP.md](./PUSH_SETUP.md) |
| **Архив клиентов** | ✅ прод | archive + sync/agg | [CLIENT_ARCHIVE.md](./CLIENT_ARCHIVE.md) |
| **Управляющий** | 📋 ТЗ | — | [CLUB_SUPERVISOR.md](./CLUB_SUPERVISOR.md) |

### Питание и ДЗ (ориентир)

- Справочники продуктов / пресетов ДЗ тянутся через `admin-data` (actions `nutrition-products`, `homework-presets`) и синхронизируются в allowlist push.
- План рациона и ДЗ живут в карточке клиента; в воронке ПНК — отдельные шаги мастера (можно пропустить питание/ДЗ по сценарию).
- Отдельного длинного ТЗ нет: при фиче — `*Core.js` + verify, не раздувать `ClientCard.jsx`.

### Как расширять

Новый модуль с офлайн-кэшем → store в `localDb` + [SYNC.md](./SYNC.md) + строка в этой таблице + [docs/README.md](./README.md).
