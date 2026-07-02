import { supabase } from '../supabase.js'

const apiOrigin = () => (typeof window !== 'undefined' ? window.location.origin : '')

/** GET /api/trainer-pull?mode=payroll&date_from=&date_to= */
export async function fetchTrainerReportPayroll({ dateFrom, dateTo }) {
  const from = String(dateFrom ?? '').slice(0, 10)
  const to = String(dateTo ?? '').slice(0, 10)
  if (!from || !to) {
    return { ok: false, error: new Error('Укажите период') }
  }

  const session = await supabase?.auth?.getSession?.()
  const token = session?.data?.session?.access_token
  if (!token) {
    return { ok: false, error: new Error('Нет сессии') }
  }

  const params = new URLSearchParams({
    mode: 'payroll',
    date_from: from,
    date_to: to,
  })

  let res
  try {
    res = await fetch(`${apiOrigin()}/api/trainer-pull?${params}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      credentials: 'same-origin',
      cache: 'no-store',
    })
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e : new Error(String(e)) }
  }

  const text = await res.text()
  let data = {}
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    data = { error: text.slice(0, 200) }
  }

  if (!res.ok) {
    return {
      ok: false,
      error: new Error(data?.error ? String(data.error) : `Ошибка ${res.status}`),
    }
  }

  return { ok: true, data }
}
