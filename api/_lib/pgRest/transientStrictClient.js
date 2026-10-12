import { isTransientDbError } from '../dbErrorPublicCore.js'

/**
 * Клиент базы, у которого временный сбой (пул занят, обрыв связи) — исключение, а не `{ data: null, error }`.
 * Для проверок доступа: там `const { data } = await …maybeSingle()` без разбора error, и сбой выглядел бы
 * как «записи нет» → 403 «не найден» → планшет навсегда снимает запись из очереди.
 * @template T
 * @param {T} client
 * @returns {T}
 */
export function strictTransientClient(client) {
  return wrap(client)
}

function wrap(obj) {
  return new Proxy(obj, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target)
      if (typeof value !== 'function') return value
      if (prop === 'then') {
        return (onFulfilled, onRejected) =>
          value
            .call(target, (res) => {
              if (res?.error && isTransientDbError(res.error)) throw res.error
              return res
            })
            .then(onFulfilled, onRejected)
      }
      return (...args) => {
        const out = value.apply(target, args)
        return out && typeof out === 'object' && typeof out.then === 'function' ? wrap(out) : out
      }
    },
  })
}
