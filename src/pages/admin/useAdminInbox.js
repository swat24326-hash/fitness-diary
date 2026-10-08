import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchInboxAudience, fetchInboxCampaign, fetchInboxCampaigns } from '../../lib/inbox/inboxAdminApiClient.js'

/** Список рассылок + клубы для формы + тихие часы сейчас. */
export function useAdminInboxList() {
  const [state, setState] = useState({ campaigns: null, clubs: [], pushBlocker: null, busy: true, error: '' })
  const reload = useCallback(() => {
    setState((s) => ({ ...s, busy: true, error: '' }))
    fetchInboxCampaigns()
      .then((d) =>
        setState({
          campaigns: d.campaigns ?? [],
          clubs: d.clubs ?? [],
          pushBlocker: d.push_blocker ?? null,
          busy: false,
          error: '',
        }),
      )
      .catch((e) => setState((s) => ({ ...s, busy: false, error: e?.message || 'Не удалось загрузить' })))
  }, [])
  useEffect(() => {
    reload()
  }, [reload])
  return { ...state, reload }
}

/** Итоги одной рассылки. */
export function useAdminInboxDetail(id) {
  const [state, setState] = useState({ data: null, busy: true, error: '' })
  const reload = useCallback(() => {
    if (!id) return
    setState((s) => ({ ...s, busy: true, error: '' }))
    fetchInboxCampaign(id)
      .then((data) => setState({ data, busy: false, error: '' }))
      .catch((e) => setState((s) => ({ ...s, busy: false, error: e?.message || 'Не удалось загрузить' })))
  }, [id])
  useEffect(() => {
    reload()
  }, [reload])
  return { ...state, reload }
}

const AUDIENCE_DEBOUNCE_MS = 400

const splitKey = (part) => (part ? part.split(',') : [])

/** Охват до отправки: пересчёт с задержкой, старые ответы не перетирают новый фильтр. */
export function useInboxAudience({ audience: kind, clubIds, halls, staffRoles }) {
  const [state, setState] = useState({ audience: null, busy: false, error: '' })
  const seq = useRef(0)
  const key = [kind, clubIds.join(','), halls.join(','), staffRoles.join(',')].join('|')
  useEffect(() => {
    const [audience, clubsPart, hallsPart, rolesPart] = key.split('|')
    const clubs = splitKey(clubsPart)
    if (!clubs.length || (audience === 'staff' && !rolesPart)) {
      setState({ audience: null, busy: false, error: '' })
      return undefined
    }
    const my = ++seq.current
    setState((s) => ({ ...s, busy: true, error: '' }))
    const t = setTimeout(() => {
      fetchInboxAudience({ audience, clubIds: clubs, halls: splitKey(hallsPart), staffRoles: splitKey(rolesPart) })
        .then((audience) => my === seq.current && setState({ audience, busy: false, error: '' }))
        .catch((e) => my === seq.current && setState({ audience: null, busy: false, error: e?.message || '' }))
    }, AUDIENCE_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [key])
  return state
}
