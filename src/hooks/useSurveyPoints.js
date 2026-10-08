import { useCallback, useEffect, useState } from 'react'
import { fetchSurveyPoints, redeemSurveyPoints } from '../lib/inbox/surveyPointsApiClient.js'

/**
 * Счёт баллов за опросы в карточке клиента. enabled=false (тренер, офлайн-клиент без id) — запроса нет.
 * @returns {{ account: object|null, error: string, busy: boolean, redeem: (points: number, comment: string) => Promise<boolean> }}
 */
export function useSurveyPoints(clientId, enabled) {
  const [account, setAccount] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!enabled || !clientId) return undefined
    let alive = true
    fetchSurveyPoints(clientId)
      .then((a) => alive && setAccount(a))
      .catch(() => alive && setAccount(null))
    return () => {
      alive = false
    }
  }, [clientId, enabled])

  const redeem = useCallback(
    async (points, comment) => {
      setBusy(true)
      setError('')
      try {
        setAccount(await redeemSurveyPoints({ clientId, points, expectedBalance: account?.balance ?? 0, comment }))
        return true
      } catch (e) {
        setError(e?.message || 'Не получилось списать — попробуйте ещё раз')
        fetchSurveyPoints(clientId).then(setAccount, () => {})
        return false
      } finally {
        setBusy(false)
      }
    },
    [clientId, account?.balance],
  )

  return { account, error, busy, redeem }
}
