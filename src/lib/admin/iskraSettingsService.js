import { getAccessTokenForAdminApi } from './adminApiClient.js'



const apiOrigin = () => (typeof window !== 'undefined' ? window.location.origin : '')



async function parseJson(res) {

  const text = await res.text()

  if (!text) return {}

  try {

    return JSON.parse(text)

  } catch {

    return { error: text.slice(0, 300) }

  }

}



/**

 * @param {string} clubId

 */

export async function fetchIskraSettings(clubId) {

  const token = await getAccessTokenForAdminApi()

  if (!token) throw new Error('Нет сессии администратора')



  const params = new URLSearchParams({

    action: 'iskra-settings',

    club_id: clubId,

  })



  const res = await fetch(`${apiOrigin()}/api/admin-data?${params}`, {

    headers: { Authorization: `Bearer ${token}` },

    credentials: 'same-origin',

    cache: 'no-store',

  })

  const data = await parseJson(res)

  if (!res.ok) throw new Error(data?.error ?? `Ошибка сервера (${res.status})`)

  return data

}



/**

 * @param {string} clubId

 * @param {{ promptAppend?: string, quickChips?: unknown, resetQuickChips?: boolean }} payload

 */

export async function saveIskraSettings(clubId, payload = {}) {

  const token = await getAccessTokenForAdminApi()

  if (!token) throw new Error('Нет сессии администратора')



  /** @type {Record<string, unknown>} */

  const body = { club_id: clubId }



  if (Object.prototype.hasOwnProperty.call(payload, 'promptAppend')) {

    body.prompt_append = String(payload.promptAppend ?? '')

  }

  if (Object.prototype.hasOwnProperty.call(payload, 'sparkBriefEnabled')) {

    body.spark_brief_enabled = payload.sparkBriefEnabled !== false

  }



  if (payload.resetQuickChips === true) {

    body.quick_chips = null

  } else if (Object.prototype.hasOwnProperty.call(payload, 'quickChips')) {

    body.quick_chips = payload.quickChips

  }



  const res = await fetch(`${apiOrigin()}/api/admin-data?action=iskra-settings`, {

    method: 'POST',

    headers: {

      Authorization: `Bearer ${token}`,

      'Content-Type': 'application/json',

    },

    credentials: 'same-origin',

    cache: 'no-store',

    body: JSON.stringify(body),

  })

  const data = await parseJson(res)

  if (!res.ok) throw new Error(data?.error ?? `Ошибка сервера (${res.status})`)

  return data

}

