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
  const [visible, setVisible] = useState(() => push.shouldShowPrompt())

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

  if (!visible || !push.supported || !hasTasks || push.subscribed) return null

  return (
    <aside className="trainer-push-prompt" role="status" aria-live="polite">
      <div className="trainer-push-prompt__main">
        <Bell size={18} aria-hidden className="trainer-push-prompt__icon" />
        <div>
          <p className="trainer-push-prompt__title">Уведомления о заданиях</p>
          <p className="trainer-push-prompt__text muted">
            Руководитель поставил задачу — пришлём на планшет, когда есть интернет. Тренировки офлайн не
            затрагиваем.
          </p>
          {push.error ? (
            <p className="trainer-push-prompt__error" role="alert">
              {push.error}
            </p>
          ) : null}
        </div>
      </div>
      <div className="trainer-push-prompt__actions">
        <button type="button" className="btn btn-primary btn-sm" disabled={push.busy} onClick={() => void push.subscribe()}>
          {push.busy ? 'Подключение…' : 'Включить'}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={push.busy}
          onClick={() => {
            push.dismissPrompt()
            setVisible(false)
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
            setVisible(false)
          }}
        >
          <X size={16} />
        </button>
      </div>
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
          : 'Получать «новое задание» на планшет (нужен интернет). Офлайн-тренировки не меняются.'}
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
            <button type="button" className="btn btn-ghost btn-sm" disabled={push.busy} onClick={() => void push.unsubscribe()}>
              <BellOff size={14} aria-hidden style={{ marginRight: 4, verticalAlign: -2 }} />
              Отключить
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-primary btn-sm" disabled={push.busy} onClick={() => void push.subscribe()}>
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
