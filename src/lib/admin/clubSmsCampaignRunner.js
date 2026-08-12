/**
 * Очередь массовых клубных SMS: по одному через переданный sendFn, пауза под rate limit.
 * Дефолты API/журнала не импортируем здесь — чтобы ядро оставалось чистым для verify.
 */

import {
  clubSmsCampaignPaceDelayMs,
  normalizeClubSmsCampaignText,
} from './clubSmsCampaignCore.js'

/**
 * @param {number} ms
 * @param {AbortSignal} [signal]
 */
export function sleepClubSmsCampaign(ms, signal) {
  const wait = Math.max(0, Number(ms) || 0)
  if (wait <= 0) return Promise.resolve()
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(Object.assign(new Error('Отменено'), { code: 'aborted' }))
      return
    }
    const t = setTimeout(() => {
      signal?.removeEventListener?.('abort', onAbort)
      resolve()
    }, wait)
    const onAbort = () => {
      clearTimeout(t)
      reject(Object.assign(new Error('Отменено'), { code: 'aborted' }))
    }
    signal?.addEventListener?.('abort', onAbort, { once: true })
  })
}

/**
 * @param {{
 *   clubId: string,
 *   recipients: Array<{ id: string, name?: string }>,
 *   text: string,
 *   scenario?: string | null,
 *   signal?: AbortSignal,
 *   paceDelayMs?: number,
 *   maxRateRetries?: number,
 *   sendFn: (p: { clubId: string, clientId: string, text: string, scenario?: string }) => Promise<object>,
 *   sleepFn?: typeof sleepClubSmsCampaign,
 *   logFn?: (row: object) => Promise<unknown>,
 *   onProgress?: (p: {
 *     index: number,
 *     total: number,
 *     ok: number,
 *     fail: number,
 *     current?: { id: string, name?: string },
 *     status: 'sending' | 'ok' | 'fail' | 'waiting_rate' | 'done' | 'aborted',
 *     error?: string,
 *   }) => void,
 * }} opts
 */
export async function runClubSmsCampaign(opts) {
  const clubId = String(opts.clubId ?? '').trim()
  const text = normalizeClubSmsCampaignText(opts.text)
  const recipients = Array.isArray(opts.recipients) ? opts.recipients : []
  const scenario = opts.scenario ? String(opts.scenario) : null
  const signal = opts.signal
  const sendFn = opts.sendFn
  if (typeof sendFn !== 'function') {
    throw new Error('runClubSmsCampaign: нужен sendFn')
  }
  const sleepFn = opts.sleepFn || sleepClubSmsCampaign
  const logFn = typeof opts.logFn === 'function' ? opts.logFn : null
  const paceDelayMs =
    opts.paceDelayMs != null ? Math.max(0, Number(opts.paceDelayMs)) : clubSmsCampaignPaceDelayMs()
  const maxRateRetries = Number(opts.maxRateRetries) > 0 ? Number(opts.maxRateRetries) : 6

  let ok = 0
  let fail = 0
  /** @type {Array<{ id: string, name?: string, error: string }>} */
  const errors = []
  const total = recipients.length

  if (!clubId || !text || total === 0) {
    opts.onProgress?.({ index: 0, total, ok: 0, fail: 0, status: 'done' })
    return { ok: 0, fail: 0, errors, aborted: false }
  }

  for (let i = 0; i < total; i++) {
    if (signal?.aborted) {
      opts.onProgress?.({ index: i, total, ok, fail, status: 'aborted' })
      return { ok, fail, errors, aborted: true }
    }

    const row = recipients[i]
    const clientId = String(row?.id ?? '').trim()
    opts.onProgress?.({
      index: i,
      total,
      ok,
      fail,
      current: row,
      status: 'sending',
    })

    let sent = false
    let lastError = 'Не удалось отправить SMS'
    for (let attempt = 0; attempt < maxRateRetries; attempt++) {
      if (signal?.aborted) {
        opts.onProgress?.({ index: i, total, ok, fail, status: 'aborted' })
        return { ok, fail, errors, aborted: true }
      }
      try {
        const sendResult = await sendFn({
          clubId,
          clientId,
          text,
          ...(scenario ? { scenario } : {}),
        })
        if (logFn) {
          try {
            await logFn({
              id: sendResult?.log_id || undefined,
              client_id: clientId,
              club_id: clubId,
              scenario: String(sendResult?.scenario ?? scenario ?? 'custom'),
              message_preview: text.slice(0, 120),
            })
          } catch {
            /* локальный журнал не критичен */
          }
        }
        ok += 1
        sent = true
        opts.onProgress?.({
          index: i,
          total,
          ok,
          fail,
          current: row,
          status: 'ok',
        })
        break
      } catch (e) {
        lastError = e?.message || 'Не удалось отправить SMS'
        if (e?.code === 'too_many_sms' || /слишком много sms/i.test(String(lastError))) {
          const waitSec = Math.max(1, Number(e?.retry_after_sec) || 60)
          opts.onProgress?.({
            index: i,
            total,
            ok,
            fail,
            current: row,
            status: 'waiting_rate',
            error: `Лимит SMS — пауза ${waitSec} с`,
          })
          try {
            await sleepFn(waitSec * 1000, signal)
          } catch (abortErr) {
            if (abortErr?.code === 'aborted') {
              opts.onProgress?.({ index: i, total, ok, fail, status: 'aborted' })
              return { ok, fail, errors, aborted: true }
            }
            throw abortErr
          }
          continue
        }
        break
      }
    }

    if (!sent) {
      fail += 1
      errors.push({ id: clientId, name: row?.name, error: lastError })
      opts.onProgress?.({
        index: i,
        total,
        ok,
        fail,
        current: row,
        status: 'fail',
        error: lastError,
      })
    }

    if (i < total - 1 && paceDelayMs > 0) {
      try {
        await sleepFn(paceDelayMs, signal)
      } catch (abortErr) {
        if (abortErr?.code === 'aborted') {
          opts.onProgress?.({ index: i + 1, total, ok, fail, status: 'aborted' })
          return { ok, fail, errors, aborted: true }
        }
        throw abortErr
      }
    }
  }

  opts.onProgress?.({ index: total, total, ok, fail, status: 'done' })
  return { ok, fail, errors, aborted: false }
}
