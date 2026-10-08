import { useCallback, useEffect, useState } from 'react'
import { fetchClientInbox, fetchClientInboxItem, answerClientInboxSurvey } from '../../lib/client/clientInboxService.js'
import { ClientSessionGoneError } from '../../lib/client/clientSession.js'

function failState(e) {
  return e instanceof ClientSessionGoneError ? 'signed_out' : 'error'
}

/** Список «Входящих» и баланс баллов за опросы. @returns {{ items: object[]|null, points: number, status: 'loading'|'ready'|'error'|'signed_out', error: string, reload: () => void }} */
export function useClientInbox() {
  const [state, setState] = useState({ items: null, points: 0, status: 'loading', error: '' })
  const reload = useCallback(() => {
    setState((s) => ({ ...s, status: 'loading', error: '' }))
    fetchClientInbox()
      .then(({ items, points }) => setState({ items, points, status: 'ready', error: '' }))
      .catch((e) => setState((s) => ({ ...s, status: failState(e), error: e?.message || '' })))
  }, [])
  useEffect(() => {
    reload()
  }, [reload])
  return { ...state, reload }
}

/** Одно сообщение: открыть (сервер отметит прочитанным) и отправить ответы опроса. */
export function useClientInboxItem(id) {
  const [state, setState] = useState({ item: null, status: 'loading', error: '' })
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')

  const reload = useCallback(() => {
    setState((s) => ({ ...s, status: 'loading', error: '' }))
    fetchClientInboxItem(id)
      .then((item) => setState({ item, status: 'ready', error: '' }))
      .catch((e) => setState((s) => ({ ...s, status: failState(e), error: e?.message || '' })))
  }, [id])
  useEffect(() => {
    reload()
  }, [reload])

  const answer = useCallback(
    async (answers) => {
      setSending(true)
      setSendError('')
      try {
        const item = await answerClientInboxSurvey(id, answers)
        setState({ item, status: 'ready', error: '' })
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
