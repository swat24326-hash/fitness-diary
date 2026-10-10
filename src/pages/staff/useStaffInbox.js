import { useCallback, useEffect, useState } from 'react'
import {
  STAFF_INBOX_CHANGED,
  answerStaffInboxSurvey,
  fetchStaffInbox,
  openStaffInboxItem,
} from '../../lib/inbox/staffInboxApiClient.js'
import { fetchStaffChats } from '../../lib/chat/staffChatApiClient.js'

const COUNT_POLL_MS = 120_000

/** Список «Входящих» сотрудника. */
export function useStaffInbox() {
  const [state, setState] = useState({ items: null, status: 'loading', error: '' })
  const reload = useCallback(() => {
    setState((s) => ({ ...s, status: 'loading', error: '' }))
    fetchStaffInbox()
      .then(({ items }) => setState({ items: items ?? [], status: 'ready', error: '' }))
      .catch((e) => setState((s) => ({ ...s, status: 'error', error: e?.message || '' })))
  }, [])
  useEffect(() => {
    reload()
  }, [reload])
  return { ...state, reload }
}

/** Одно сообщение: открыть (сервер отметит прочитанным) и отправить ответы опроса. */
export function useStaffInboxItem(id) {
  const [state, setState] = useState({ item: null, status: 'loading', error: '' })
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const reload = useCallback(() => {
    setState((s) => ({ ...s, status: 'loading', error: '' }))
    openStaffInboxItem(id)
      .then((item) => setState({ item, status: 'ready', error: '' }))
      .catch((e) => setState((s) => ({ ...s, status: 'error', error: e?.message || '' })))
  }, [id])
  useEffect(() => {
    reload()
  }, [reload])
  const answer = useCallback(
    async (answers) => {
      setSending(true)
      setSendError('')
      try {
        setState({ item: await answerStaffInboxSurvey(id, answers), status: 'ready', error: '' })
      } catch (e) {
        setSendError(e?.message || 'Не получилось отправить — попробуйте ещё раз')
      } finally {
        setSending(false)
      }
    },
    [id],
  )
  return { ...state, reload, answer, sending, sendError }
}

/** Точка на конверте в шапке: рассылки + диалоги с клиентами; раз в 2 минуты, при возврате на вкладку и после чтения. Офлайн — тихо. */
export function useStaffInboxCount(enabled) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (!enabled) {
      setCount(0)
      return undefined
    }
    let alive = true
    const load = () =>
      Promise.allSettled([fetchStaffInbox(), fetchStaffChats()]).then((res) => {
        if (!alive || res.every((r) => r.status === 'rejected')) return
        setCount(res.reduce((sum, r) => sum + (r.status === 'fulfilled' ? Number(r.value?.attention) || 0 : 0), 0))
      })
    const onVisible = () => document.visibilityState === 'visible' && load()
    load()
    const t = window.setInterval(load, COUNT_POLL_MS)
    window.addEventListener(STAFF_INBOX_CHANGED, load)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      alive = false
      window.clearInterval(t)
      window.removeEventListener(STAFF_INBOX_CHANGED, load)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [enabled])
  return count
}
