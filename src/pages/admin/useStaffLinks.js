import { useCallback, useEffect, useState } from 'react'
import { fetchTrainersViaAdminApi } from '../../lib/admin/adminApiClient'
import { fetchStaffLinks, saveStaffLink } from '../../lib/admin/staffLinkService.js'

/** Связи «управляющий → тренер» и тренеры для выбора. Только онлайн, только главный админ. */
export function useStaffLinks() {
  const [state, setState] = useState({ links: new Map(), trainers: [], available: false, error: '' })
  const [savingId, setSavingId] = useState('')

  const load = useCallback(async () => {
    try {
      const [data, list] = await Promise.all([fetchStaffLinks(), fetchTrainersViaAdminApi()])
      setState({
        links: new Map((data?.links ?? []).map((l) => [l.supervisor_id, l.trainer_id])),
        trainers: (Array.isArray(list?.trainers) ? list.trainers : []).filter((t) => t.is_active !== false),
        available: Boolean(data?.available),
        error: '',
      })
    } catch (e) {
      setState((s) => ({ ...s, error: e?.message || 'Не удалось загрузить связи' }))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const save = useCallback(
    async (supervisorId, trainerId) => {
      setSavingId(supervisorId)
      try {
        await saveStaffLink(supervisorId, trainerId)
        await load()
      } catch (e) {
        setState((s) => ({ ...s, error: e?.message || 'Не удалось сохранить' }))
      } finally {
        setSavingId('')
      }
    },
    [load],
  )

  return { ...state, savingId, save }
}
