# Как вносить изменения (CONTRIBUTING)

Короткий вход для человека без Cursor. Политика агента — `.cursor/rules/`; **маршрут по задачам** — [docs/AGENT_PLAYBOOK.md](./docs/AGENT_PLAYBOOK.md); карта продукта — [docs/PROJECT_HANDOFF_FOR_AI.md](./docs/PROJECT_HANDOFF_FOR_AI.md).

## Перед кодом

1. Прочитать [AGENT_PLAYBOOK.md](./docs/AGENT_PLAYBOOK.md) или handoff и нужный раздел [docs/README.md](./docs/README.md).
2. Логику класть в `src/lib/` или `api/_lib/`, не раздувать JSX.
3. Новое API-действие — через `admin-data?action=` (лимит ≤12 functions), см. [docs/API.md](./docs/API.md).
4. Sync / офлайн — [docs/SYNC.md](./docs/SYNC.md); не обходить `saveLocalWithSync`.

## Перед «готово»

```bash
npm run lint
# если sync, статистика, абонементы, agg, офлайн:
npm run qa:local
```

Ветвистая чистая логика → `scripts/verify-*.mjs` + строка в `scripts/agent-qa.mjs` ([docs/TESTING.md](./docs/TESTING.md)).

## Документация

DoD: `.cursor/rules/fitness-diary-docs.mdc`. Фича shipped или смена ролей/API/sync → обновить `docs/` и при необходимости [CHANGELOG.md](./CHANGELOG.md). Новый файл → строка в `docs/README.md`.

## Коммит и деплой

- Коммит/push — по договорённости с владельцем репо.
- Prod: см. [docs/RELEASE.md](./docs/RELEASE.md). Инциденты: процедуры — [docs/RUNBOOK.md](./docs/RUNBOOK.md); журнал кейсов — [docs/INCIDENTS.md](./docs/INCIDENTS.md).
