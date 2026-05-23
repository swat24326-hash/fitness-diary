/**

 * Подтягивание справочников (упражнения, челленджи) через Vercel API.

 */



import { putStore } from './localDb'

import { isSupabaseConfigured } from './supabase'

import { fetchChallengesForClubViaApi } from './admin/adminApiClient'

import { pullExercisesFromCloud } from './exerciseCatalog'



export { pullExercisesFromCloud }



export async function pullChallengesForClubFromCloud(clubId) {

  const cid = String(clubId ?? '').trim()

  if (!cid || !isSupabaseConfigured()) return { ok: false, reason: 'no_club_or_supabase' }



  try {

    const viaApi = await fetchChallengesForClubViaApi(cid)

    if (viaApi) {

      for (const row of viaApi.challenges) {

        await putStore('challenges', row)

      }

      return { ok: true, count: viaApi.count, source: 'api' }

    }

  } catch (e) {

    return { ok: false, error: String(e?.message ?? e ?? 'Ошибка загрузки челленджей') }

  }



  return { ok: false, error: 'Нет связи с сервером приложения — челленджи не обновлены' }

}


