import { useCallback, useEffect, useRef, useState } from 'react'
import {
  STAFF_INBOX_CHANGED,
  answerStaffInboxSurvey,
  fetchStaffInbox,
  openStaffInboxItem,
} from '../../lib/inbox/staffInboxApiClient.js'
import { fetchStaffChats } from '../../lib/chat/staffChatApiClient.js'
import { didInboxCountRise } from '../../lib/chat/chatSoundCore.js'
import { armChatSound, playChatSound } from '../../lib/chat/chatSoundPlayer.js'

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

/**
 * Точка на конверте в шапке: рассылки + диалоги с клиентами; раз в 2 минуты, при возврате на вкладку и после чтения. Офлайн — тихо.
 * Число выросло — звук, если сотрудник включил «Звуки сообщений».
 */
export function useStaffInboxCount(enabled) {
  const [count, setCount] = useState(0)
  const lastRef = useRef(null)
  useEffect(() => {
    lastRef.current = null
    if (!enabled) {
      setCount(0)
      return undefined
    }
    armChatSound('staff')
    let alive = true
    const load = () =>
      Promise.allSettled([fetchStaffInbox(), fetchStaffChats()]).then((res) => {
        if (!alive || res.every((r) => r.status === 'rejected')) return
        const next = res.reduce((sum, r) => sum + (r.status === 'fulfilled' ? Number(r.value?.attention) || 0 : 0), 0)
        if (didInboxCountRise(lastRef.current, next)) playChatSound('inbox', 'staff')
        lastRef.current = next
        setCount(next)
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
