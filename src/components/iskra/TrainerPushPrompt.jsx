import { useCallback, useEffect, useState } from 'react'
import { Bell, BellOff, X } from 'lucide-react'
import { fetchIskraDispatch } from '../../lib/admin/iskraDispatchService.js'
import { sortActiveDispatchTasks } from '../../lib/admin/iskraDispatchInboxActionsCore.js'
import { isSupabaseConfigured } from '../../lib/supabase'
import { useTrainerPush } from '../../hooks/useTrainerPush.js'

/**
 * @param {{ clubId?: string }} props
 */
export function TrainerPushPrompt({ clubId = '' }) {
  const push = useTrainerPush({ clubId })
  const [hasTasks, setHasTasks] = useState(false)
  const [dismissedCompact, setDismissedCompact] = useState(false)
  const [showFull, setShowFull] = useState(() => push.shouldShowPrompt())

  const loadTasks = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setHasTasks(false)
      return
    }
    try {
      const data = await fetchIskraDispatch({ clubId: clubId || undefined, view: 'inbox', limit: 20 })
      const list = Array.isArray(data?.items) ? data.items : []
      setHasTasks(sortActiveDispatchTasks(list).length > 0)
    } catch {
      setHasTasks(false)
    }
  }, [clubId])

  useEffect(() => {
    void loadTasks()
  }, [loadTasks])

  useEffect(() => {
    setShowFull(push.shouldShowPrompt())
  }, [push.subscribed, push.permission, push.supported])

  if (!push.supported || !hasTasks || push.subscribed) return null

  const permissionDenied = push.permission === 'denied'

  if (showFull) {
    return (
      <aside className="trainer-push-prompt" role="status" aria-live="polite">
        <div className="trainer-push-prompt__main">
          <BellOff size={18} aria-hidden className="trainer-push-prompt__icon" />
          <div>
            <p className="trainer-push-prompt__title">Уведомления выкл</p>
            <p className="trainer-push-prompt__text muted">
              Есть задания Планёрки, но push на планшете выключен — новое придёт только когда откроете
              приложение.
            </p>
            {push.error ? (
              <p className="trainer-push-prompt__error" role="alert">
                {push.error}
              </p>
            ) : null}
          </div>
        </div>
        <div className="trainer-push-prompt__actions">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={push.busy || permissionDenied}
            title={permissionDenied ? 'Разрешите уведомления в настройках браузера' : undefined}
            onClick={() => void push.subscribe()}
          >
            {push.busy ? 'Подключение…' : 'Включить'}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={push.busy}
            onClick={() => {
              push.dismissPrompt()
              setShowFull(false)
            }}
          >
            Позже
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm trainer-push-prompt__close"
            aria-label="Закрыть"
            onClick={() => {
              push.dismissPrompt()
              setShowFull(false)
            }}
          >
            <X size={16} />
          </button>
        </div>
      </aside>
    )
  }

  if (dismissedCompact) return null

  return (
    <aside className="trainer-push-prompt trainer-push-prompt--compact" role="status">
      <BellOff size={16} aria-hidden className="trainer-push-prompt__icon" />
      <p className="trainer-push-prompt__compact-text">
        {permissionDenied
          ? 'Уведомления заблокированы в браузере — задания только в шапке → Планёрка'
          : 'Уведомления выкл — задания только в шапке'}
      </p>
      {!permissionDenied ? (
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={push.busy}
          onClick={() => void push.subscribe()}
        >
          {push.busy ? '…' : 'Включить'}
        </button>
      ) : null}
      <button
        type="button"
        className="btn btn-ghost btn-sm trainer-push-prompt__close"
        aria-label="Скрыть"
        onClick={() => setDismissedCompact(true)}
      >
        <X size={14} />
      </button>
    </aside>
  )
}

/**
 * @param {{ clubId?: string }} props
 */
export function TrainerPushSettings({ clubId = '' }) {
  const push = useTrainerPush({ clubId })

  if (!push.supported) {
    return (
      <section className="card trainer-push-settings">
        <h2 className="section-title" style={{ marginBottom: 6 }}>
          Уведомления Планёрки
        </h2>
        <p className="muted" style={{ margin: 0 }}>
          Этот браузер не поддерживает push. Задания по-прежнему в шапке → Планёрка.
        </p>
      </section>
    )
  }

  return (
    <section className="card trainer-push-settings">
      <h2 className="section-title" style={{ marginBottom: 6 }}>
        Уведомления Планёрки
      </h2>
      <p className="section-sub" style={{ margin: '0 0 12px' }}>
        {push.subscribed
          ? 'Включены на этом планшете — новые задания приходят, когда планшет онлайн.'
          : push.permission === 'denied'
            ? 'Сейчас выкл (браузер блокирует). Разрешите уведомления для сайта или смотрите задания в шапке → Планёрка.'
            : 'Сейчас выкл — новое задание видно в шапке. Можно включить push на планшет.'}
      </p>
      {push.error ? (
        <p className="trainer-push-settings__error" role="alert">
          {push.error}
        </p>
      ) : null}
      <div className="trainer-push-settings__actions">
        {push.subscribed ? (
          <>
            <button type="button" className="btn btn-secondary btn-sm" disabled={push.busy} onClick={() => void push.testPush()}>
              Проверить
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={push.busy}
              onClick={() => void push.reconnect()}
              title="Сбросить и заново привязать к серверу"
            >
              <Bell size={14} aria-hidden style={{ marginRight: 4, verticalAlign: -2 }} />
              {push.busy ? '…' : 'Переподключить'}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={push.busy} onClick={() => void push.unsubscribe()}>
              <BellOff size={14} aria-hidden style={{ marginRight: 4, verticalAlign: -2 }} />
              Отключить
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={push.busy || push.permission === 'denied'}
            onClick={() => void push.subscribe()}
          >
            <Bell size={14} aria-hidden style={{ marginRight: 4, verticalAlign: -2 }} />
            {push.busy ? 'Подключение…' : 'Включить уведомления'}
          </button>
        )}
      </div>
      {!push.configured ? (
        <p className="muted" style={{ margin: '10px 0 0', fontSize: 13 }}>
          Сервер push ещё не настроен — задания видны в Планёрке без задержки при открытии приложения.
        </p>
      ) : null}
    </section>
  )
}
