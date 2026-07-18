# Changelog (FIT-CITY)

Краткие заметки для клуба и команды: **что изменилось для зала**, не полный git log.  
Детали для разработчиков — коммиты и [docs/README.md](./docs/README.md).

Формат: дата · кратко · куда смотреть в docs при необходимости.

---

## 2026-07

- **Документация:** актуальный handoff, индекс, `API` / `SYNC` / `DATA_MODEL` / `TESTING` / `PWA`; путь серверного кода — `api/_lib`.
- **ПНК:** одна главная кнопка на шаге тренера (шапка / «Начать тренировку»); доска — автовыбор срочного + сводка под ссылкой; итог визита у менеджера. [docs/PNK_FUNNEL.md](./docs/PNK_FUNNEL.md).
- **ПНК (воронка):** в проде — создание менеджером, мастер на карточке тренера, доска `/sales/pnk`, KPI. См. [docs/PNK_FUNNEL.md](./docs/PNK_FUNNEL.md).
- **Каналы:** Max у тренера в продукте; SMS клуба (Мои Звонки) — backlog. [docs/OUTREACH_CHANNELS_ROADMAP.md](./docs/OUTREACH_CHANNELS_ROADMAP.md).
- **Web Push** для планёрки / заданий — [docs/PUSH_SETUP.md](./docs/PUSH_SETUP.md).

## 2026-06 (срез)

- Роль **менеджера по продажам**, ежедневный отчёт и план. [docs/SALES_MANAGER.md](./docs/SALES_MANAGER.md).
- **Архив клиентов** (фаза B): sync / UI / agg. [docs/CLIENT_ARCHIVE.md](./docs/CLIENT_ARCHIVE.md).
- **ИСКРА:** dispatch, планёрка, self-learning, Pro-упаковка — серия `docs/ISKRA_*.md`.
- Паритет статистики API ↔ офлайн (`verify-stats-agg-parity`), чеклисты RELEASE / RUNBOOK / Supabase prod.

---

При релизе с заметным UX для зала — **добавьте 1–3 пункта сверху** в том же PR (правило ship).
