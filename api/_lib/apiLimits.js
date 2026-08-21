/** Лимиты ответов API — защита Vercel и памяти клиента. Синхрон с adminConstants где указано. */

/** Макс. клиентов клуба в одном ответе list-clients (как ADMIN_CLIENTS_REMOTE_LIMIT). */
export const LIST_CLIENTS_MAX = 50_000

/** Размер страницы list-clients при offset/limit. */
export const LIST_CLIENTS_PAGE_SIZE = 500

/** Макс. тренировок в trainer-pull за один запрос (90 дней). */
export const TRAINER_PULL_MAX_TRAININGS = 25_000

/** Окно body_measurements в trainer-pull (месяцев). */
export const TRAINER_PULL_BODY_MEASUREMENTS_MONTHS = 12

/** Макс. замеров в trainer-pull за один запрос. */
export const TRAINER_PULL_MAX_BODY_MEASUREMENTS = 3_000

/** Макс. пользователей users при list-trainers (все роли). */
export const LIST_TRAINERS_MAX_USERS = 5_000

/** Макс. абонементов клуба в list-memberships. */
export const LIST_MEMBERSHIPS_MAX = 100_000

/** Макс. строк client_hall_lifecycle в том же ответе list-memberships. */
export const LIST_CLIENT_HALL_LIFECYCLE_MAX = 50_000

/** Макс. строк client_hall_lifecycle для client-retention agg. */
export const CLUB_STATS_MAX_CLIENT_HALL_LIFECYCLE = 50_000

/** Макс. клиентов для club-stats / ИСКРА за один запрос. */
export const CLUB_STATS_MAX_CLIENTS = 50_000

/** Макс. абонементов для club-stats / ИСКРА за один запрос. */
export const CLUB_STATS_MAX_MEMBERSHIPS = 100_000

/** Макс. тренировок за период в club-stats / ИСКРА. */
export const CLUB_STATS_MAX_TRAININGS = 80_000

/** Макс. health_cards при bulk pull админки. */
export const HEALTH_CARDS_MAX = 20_000

/** Окно body_measurements в bulk health-cards (месяцев). */
export const HEALTH_CARDS_BODY_MEASUREMENTS_MONTHS = 12

/** Макс. body_measurements в bulk health-cards. */
export const HEALTH_CARDS_MAX_BODY_MEASUREMENTS = 5_000

/** Окно client_weight_entries в trainer-pull (месяцев). */
export const TRAINER_PULL_WEIGHT_ENTRIES_MONTHS = 24

/** Макс. записей веса в trainer-pull за один запрос. */
export const TRAINER_PULL_MAX_WEIGHT_ENTRIES = 3_000
