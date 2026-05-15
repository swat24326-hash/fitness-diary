/** Параметры журнала админа: расширяйте при росте нагрузки (кэш, RPC). */

export const ADMIN_JOURNAL_DEFAULT_PAGE_SIZE = 50

/** Макс. строк на страницу (защита от случайного запроса миллиона строк). */
export const ADMIN_JOURNAL_MAX_PAGE_SIZE = 100

export const ADMIN_JOURNAL_PAGE_SIZE_OPTIONS = [25, 50, 100]

/** Макс. подсказок при поиске клиента в журнале (один запрос). */
export const ADMIN_CLIENT_SEARCH_LIMIT = 50

/** Минимум символов в строке поиска клиента. */
export const ADMIN_CLIENT_SEARCH_MIN_LEN = 2

/** Задержка перед запросом поиска клиента (мс). */
export const ADMIN_CLIENT_SEARCH_DEBOUNCE_MS = 320

/** Пулл справочников из Supabase одним потоком чанками. */
export const ADMIN_SYNC_BATCH_SIZE = 400

/** Подсчёт клиентов по тренеру: размер страницы при обходе с сервера. */
export const ADMIN_CLIENT_COUNT_BATCH = 5000

/**
 * Макс. строк клиентов клуба с Supabase за один запрос.
 * При достижении лимита в UI показывается предупреждение.
 * Можно поднять (например 100000), но растёт память в браузере и нагрузка на PostgREST;
 * для очень больших баз лучше пагинация или отдельный поиск, а не один список.
 */
export const ADMIN_CLIENTS_REMOTE_LIMIT = 50000
