/** Сетевые сбои Supabase (обрыв, таймаут) — повторяем запрос, не падаем сразу. */

export function isRetryableNetworkError(err) {

  const msg = String(err?.message ?? err ?? '').toLowerCase()

  if (/failed to fetch|networkerror|network request failed|load failed|connection reset|err_connection|http2_ping|timeout|aborted/i.test(msg)) {

    return true

  }

  const status = Number(err?.status ?? err?.statusCode ?? err?.context?.response?.status ?? 0)

  if (status === 409 || status === 403 || status === 401 || status === 400 || status === 422) return false

  return status === 502 || status === 503 || status === 504

}



export function sleep(ms) {

  return new Promise((r) => setTimeout(r, ms))

}



/** Очередь REST-запросов: снижает ERR_CONNECTION_RESET / HTTP2_PING при пачке параллельных fetch. */

let gateTail = Promise.resolve()



export function withSupabaseGate(fn) {

  const run = gateTail.then(() => fn(), () => fn())

  gateTail = run.then(() => undefined, () => undefined)

  return run

}



/**

 * @template T

 * @param {() => Promise<T>} fn

 * @param {{ attempts?: number, baseDelayMs?: number, timeoutMs?: number, serialize?: boolean }} [opts]

 */

export async function withSupabaseRetry(fn, opts = {}) {

  const attempts = opts.attempts ?? 3

  const baseDelayMs = opts.baseDelayMs ?? 500

  const timeoutMs = opts.timeoutMs ?? 6000

  const serialize = opts.serialize === true



  const run = async () => {

    let lastErr

    for (let i = 0; i < attempts; i++) {

      try {

        return await withFastTimeout(fn(), timeoutMs)

      } catch (e) {

        lastErr = e

        if (!isRetryableNetworkError(e) || i === attempts - 1) throw e

        const jitter = Math.floor(Math.random() * 120)

        await sleep(baseDelayMs * (i + 1) + jitter)

      }

    }

    throw lastErr

  }



  return serialize ? withSupabaseGate(run) : run()

}



export function humanizeNetworkError(err) {

  const msg = String(err?.message ?? err ?? '')

  if (/failed to fetch|networkerror|network request failed|load failed|connection reset|err_connection|http2_ping|timeout|aborted/i.test(msg)) {

    return (

      'Браузер не смог достучаться до Supabase (обрыв соединения). ' +

      'Закройте лишние вкладки, отключите VPN/антивирус HTTPS, попробуйте Chrome. ' +

      'Сервер из терминала доступен — чаще всего мешает браузер или расширения.'

    )

  }

  return msg || 'Ошибка сети'

}



export function withFastTimeout(promise, ms = 6000) {

  return Promise.race([

    promise,

    new Promise((_, reject) => {

      setTimeout(() => reject(new Error('timeout')), ms)

    }),

  ])

}



export function assertSupabaseOk({ error }) {

  if (!error) return

  const e = new Error(error.message ?? 'Ошибка Supabase')

  e.status = error.status

  e.code = error.code

  throw e

}


