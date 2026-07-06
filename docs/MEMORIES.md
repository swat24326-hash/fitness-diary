# MEMORIES — открытые и отклонённые findings (глубокий аудит)

Формат строки: `дата | место | первопричина | PR | статус`

<!-- Удалять строку после merge PR. Статус rejected >30 дней — удалить. -->

| Дата | Место | Первопричина | PR | Статус |
|------|--------|--------------|-----|--------|
| 2026-07-06 | `membershipTypesService.mergeMembershipTypesForClub` forceFromCloud | forceFromCloud удалял локальные строки с pending insert (новый тип до Sync) | — | fixed in repo (6820b6e+) |
