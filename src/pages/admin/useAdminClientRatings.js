import { useCallback, useEffect, useState } from 'react'
import { fetchAdminClientRating, fetchAdminClientRatings } from '../../lib/client/clientRatingAdminApiClient.js'

/** Список отвеченных оценок (вкладка «Оценки»). */
export function useAdminClientRatingsList() {
  const [state, setState] = useState({ items: null, busy: true, error: '' })
  const reload = useCallback(() => {
    setState((s) => ({ ...s, busy: true, error: '' }))
    fetchAdminClientRatings()
      .then((d) => setState({ items: d.items ?? [], busy: false, error: '' }))
      .catch((e) => setState((s) => ({ ...s, busy: false, error: e?.message || 'Не удалось загрузить' })))
  }, [])
  useEffect(() => {
    reload()
  }, [reload])
  return { ...state, reload }
}

/** Одна оценка. */
export function useAdminClientRatingDetail(id) {
  const [state, setState] = useState({ rating: null, busy: true, error: '' })
  const reload = useCallback(() => {
    if (!id) return
    setState((s) => ({ ...s, busy: true, error: '' }))
    fetchAdminClientRating(id)
      .then((d) => setState({ rating: d.rating ?? null, busy: false, error: '' }))
      .catch((e) => setState((s) => ({ ...s, busy: false, error: e?.message || 'Не удалось загрузить' })))
  }, [id])
  useEffect(() => {
    reload()
  }, [reload])
  return { ...state, reload }
}
