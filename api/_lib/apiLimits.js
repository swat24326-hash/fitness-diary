/** Лимиты ответов API — защита Vercel и памяти клиента. Синхрон с adminConstants где указано. */

/** Макс. клиентов клуба в одном ответе list-clients (как ADMIN_CLIENTS_REMOTE_LIMIT). */
export const LIST_CLIENTS_MAX = 50_000

/** Размер страницы list-clients при offset/limit. */
export const LIST_CLIENTS_PAGE_SIZE = 500

/** Макс. тренировок в trainer-pull за один запрос (90 дней). */
export const TRAINER_PULL_MAX_TRAININGS = 25_000

/** Макс. пользователей users при list-trainers (все роли). */
export const LIST_TRAINERS_MAX_USERS = 5_000
