/**
 * Ошибка Postgres → текст для клиента без значений строк (detail / hint / эхо ввода).
 * Сырые message / detail / hint — только в лог сервера.
 * Английский маркер в скобках — стабильный класс ошибки: по нему фоллбэки клиента
 * (`duplicate key`, `foreign key`, `does not exist`, `permission`) узнают ситуацию.
 * Имя ограничения (`sale_clips_client_id_fkey`) — схема, не данные: по нему планшет даёт
 * подсказку в «Помощи» (appDiagnostics) и разбирается инцидент без доступа к логам ВМ.
 */

const CONSTRAINT_RE = /constraint "([a-z][a-z0-9_]{0,62})"/i

const BY_CODE = {
  23505: { status: 409, message: 'Такая запись уже есть (duplicate key)' },
  23503: { status: 409, message: 'Связанная запись не найдена или используется (foreign key violation)' },
  23502: { status: 400, message: 'Не заполнено обязательное поле (not null violation)' },
  23514: { status: 400, message: 'Значение не прошло проверку (check constraint violation)' },
  '22P02': { status: 400, message: 'Некорректный формат значения (invalid input)' },
  22007: { status: 400, message: 'Некорректный формат даты (invalid input)' },
  22008: { status: 400, message: 'Некорректная дата (invalid input)' },
  22003: { status: 400, message: 'Число вне допустимого диапазона (invalid input)' },
  22001: { status: 400, message: 'Слишком длинное значение (invalid input)' },
  42501: { status: 403, message: 'Нет доступа (permission denied)' },
  '42P01': { status: 404, message: 'Таблица не найдена (relation does not exist)' },
  42703: { status: 400, message: 'Поле не найдено (column does not exist)' },
  57014: { status: 503, message: 'База не ответила вовремя — повторите' },
}

export const DB_ERROR_PUBLIC_FALLBACK_RU = 'Ошибка базы данных — повторите или обратитесь к администратору'

/**
 * @param {{ code?: unknown, message?: unknown } | null | undefined} e
 * @returns {{ status: number, code: string, message: string }}
 */
export function pgErrorPublic(e) {
  const code = e?.code != null && String(e.code) ? String(e.code) : 'PGRST000'
  const hit = BY_CODE[code]
  const constraint = hit ? CONSTRAINT_RE.exec(String(e?.message ?? ''))?.[1] : null
  const base = hit?.message ?? DB_ERROR_PUBLIC_FALLBACK_RU
  return { status: hit?.status ?? 400, code, message: constraint ? `${base} [${constraint}]` : base }
}

/**
 * Текст ошибки БД для JSON-ответа /api/*; сырой текст пишется в лог с меткой.
 * @param {unknown} e
 * @param {string} [label]
 */
export function publicDbErrorMessage(e, label = 'db') {
  logDbError(label, e)
  return pgErrorPublic(/** @type {any} */ (e)).message
}

/** @param {string} label @param {unknown} e */
export function logDbError(label, e) {
  const err = /** @type {any} */ (e)
  console.warn(`[${label}]`, err?.code ?? '', err?.message ?? String(e ?? ''), err?.detail ?? err?.details ?? '')
}
