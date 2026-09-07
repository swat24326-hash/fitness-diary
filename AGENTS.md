# Агент Cursor — короткий вход

**Не читать весь репо и все `docs/`.** Сначала этот файл → узкая ветка.

Полный маршрут: [`docs/AGENT_PLAYBOOK.md`](docs/AGENT_PLAYBOOK.md)  
Как экономить лимиты **без потери качества**: [`docs/CURSOR_LIMITS.md`](docs/CURSOR_LIMITS.md)  
Хуки (подтверждение push/деплоя, блок секретов, авто-lint): [`docs/HOOKS.md`](docs/HOOKS.md)  
Карта docs: [`docs/README.md`](docs/README.md)

## Порядок

1. Тип задачи → таблица в `AGENT_PLAYBOOK` §3 (баг / sync / фича / API / деплой).
2. Один узкий doc (не все `docs/` подряд). Правила проекта — в `.cursor/rules/`. Два из них подключаются **по типу задачи**, их нужно открыть самому: `fitness-diary-features.mdc` (новая фича / развитие функции) и `fitness-diary-north-star-lead.mdc` (приоритет, цель, «что дальше»).
3. Код: `grep` / точный путь. Логика — в `src/lib/` или `api/_lib/`.
4. Перед «готово»: `npm run lint`; критический путь — verify / `qa:local` по ship.

## Критический контур (качество важнее экономии)

| Ситуация | Обязательно |
|----------|-------------|
| Жалоба / «опять» / баг на проде | `docs/INCIDENTS.md` → `docs/CODE_TRACE.md` |
| Sync / черновик / Закончить / абон | `docs/SYNC.md` или domain; после кода — `npm run qa:critical` (или узкий verify) |
| Новая фича / развитие функции | `.cursor/rules/fitness-diary-features.mdc` **до** плана и кода + playbook §3 |
| Приоритет, «что делать», оплаты / переезд РФ | `.cursor/rules/fitness-diary-north-star-lead.mdc` + `docs/PATH_TO_GOAL.md` |
| Трогаете sync/domain | не обходить `saveLocalWithSync` / очередь |

## Куда смотреть (шпаргалка)

| Вопрос | Файл |
|--------|------|
| Роли, стек, каталоги | `docs/PROJECT_HANDOFF_FOR_AI.md` |
| Жалоба / «опять» | `docs/INCIDENTS.md` → `docs/CODE_TRACE.md` |
| Sync / офлайн | `docs/SYNC.md` |
| API | `docs/API.md` |
| Очередь продукта | `docs/PATH_TO_GOAL.md` |
| Цель продукта | `docs/PRODUCT_VISION.md` |

## Не делать

- Читать 50+ файлов `docs/` «на всякий случай»
- Коммит / push / prod без явной просьбы владельца
- Стартовать оплаты / cutover РФ без явной команды
- Резать проверки или правила ради экономии токенов
