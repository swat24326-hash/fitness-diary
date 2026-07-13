# База знаний ИСКРЫ (FIT-CITY)

Человекочитаемые копии статей для владельца и команды. **Источник истины в коде:** `src/lib/admin/iskraKnowledgeBaseArticles.js` — при расхождении правьте сначала JS, потом эти файлы.

## Назначение

- Ответы ИСКРЫ на вопросы «как в приложении»: клиент, абонемент, тренировка, sync, разделы админки.
- Для **app_admin** (собственник/админ) — через **Gemini** с блоком `app_knowledge` в промпте.
- Для остальных ролей — краткий instant-ответ из тех же статей.

## Статьи

| Файл | Тема | ID в коде |
|------|------|-----------|
| [client_create.md](./client_create.md) | Клиент | `client_create` |
| [membership_add.md](./membership_add.md) | Абонемент | `membership_add` |
| [training_complete.md](./training_complete.md) | Планшет тренера | `training_complete` |
| [sync_offline.md](./sync_offline.md) | Sync / офлайн | `sync_offline` |
| [admin_organization.md](./admin_organization.md) | Организация | `admin_organization` |
| [admin_sales.md](./admin_sales.md) | Продажи | `admin_sales` |
| [admin_statistics.md](./admin_statistics.md) | Статистика | `admin_statistics` |
| [admin_iskra.md](./admin_iskra.md) | ИСКРА | `admin_iskra` |
| [app_general.md](./app_general.md) | Общее | `app_general` |
| [troubleshoot_sync.md](./troubleshoot_sync.md) | Проблемы sync | `troubleshoot_sync` |

## Проверка

```bash
node scripts/verify-iskra-knowledge-base.mjs
```
