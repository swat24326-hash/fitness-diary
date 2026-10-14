import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { getHealthCard } from '../../lib/dataAccess'
import { calendarDayInTimeZoneIso } from '../../lib/dateRu.js'
import { LOCAL_DATA_CHANGED } from '../../lib/localDataEvents.js'
import { latestClientPlanMark } from '../../lib/clientPlans/clientPlanSendService.js'
import { loadHomeworkAuto, saveHomeworkAuto } from '../../lib/homework/auto/homeworkAutoService.js'
import { loadHealthScreening, saveHealthScreening } from '../../lib/health/healthScreeningService.js'
import { screeningWithClearance } from '../../lib/health/healthScreeningCore.js'

/** Настройки авто-ДЗ клиента + карточка и анкета здоровья + последняя отправка ДЗ (для причины паузы). */
export function useHomeworkAutoSchedule(client) {
  const { user, isAdmin, isTrainer } = useAuth()
  const clientId = String(client?.id ?? '')
  const [state, setState] = useState({ loaded: false, row: null, health: null, screeningRow: null, lastManualDay: null })
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    const [row, health, screeningRow, mark] = await Promise.all([
      loadHomeworkAuto(clientId),
      getHealthCard(clientId).catch(() => null),
      loadHealthScreening(clientId),
      latestClientPlanMark(clientId, 'homework').catch(() => null),
    ])
    setState({ loaded: true, row, health, screeningRow, lastManualDay: mark?.sent_at ? calendarDayInTimeZoneIso(mark.sent_at) : null })
  }, [clientId])

  useEffect(() => {
    void reload()
    window.addEventListener(LOCAL_DATA_CHANGED, reload)
    return () => window.removeEventListener(LOCAL_DATA_CHANGED, reload)
  }, [reload])

  const save = useCallback(
    async (patch) => {
      setError('')
      try {
        const row = await saveHomeworkAuto({ client, userId: user?.id, prev: state.row, patch })
        setState((s) => ({ ...s, row }))
      } catch (e) {
        setError(e?.message || 'Не удалось сохранить настройки')
      }
    },
    [client, user?.id, state.row],
  )

  /** Тренер подтвердил допуск по анкете — прямо из вкладки «Авто». */
  const confirmClearance = useCallback(async () => {
    setError('')
    try {
      const answers = screeningWithClearance(state.screeningRow?.answers, user?.id)
      const screeningRow = await saveHealthScreening({ client, userId: user?.id, prev: state.screeningRow, answers })
      setState((s) => ({ ...s, screeningRow }))
    } catch (e) {
      setError(e?.message || 'Не удалось подтвердить допуск')
    }
  }, [client, user?.id, state.screeningRow])

  return {
    ...state,
    screening: state.screeningRow?.answers ?? null,
    error,
    save,
    confirmClearance,
    userId: user?.id ?? null,
    canEdit: Boolean(client?.id && user?.id && (isAdmin || isTrainer) && !client?.archived_at),
  }
}
