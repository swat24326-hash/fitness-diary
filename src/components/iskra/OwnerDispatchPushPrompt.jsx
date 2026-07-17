import { useState } from 'react'
import { Bell, X } from 'lucide-react'
import { useTrainerPush } from '../../hooks/useTrainerPush.js'

const OWNER_PROMPT_DISMISS_KEY = 'owner_dispatch_push_prompt_dismissed_v1'

/**
 * Баннер подписки владельца/админа: push «принял / сделал» по заданиям Планёрки.
 * @param {{ clubId?: string, hasActiveSentTasks?: boolean }} props
 */
export function OwnerDispatchPushPrompt({ clubId = '', hasActiveSentTasks = false }) {
  const push = useTrainerPush({ clubId, promptDismissKey: OWNER_PROMPT_DISMISS_KEY })
  const [visible, setVisible] = useState(() => push.shouldShowPrompt())

  if (!visible || !push.supported || !hasActiveSentTasks || push.subscribed) return null

  return (
    <aside className="trainer-push-prompt owner-dispatch-push-prompt" role="status" aria-live="polite">
      <div className="trainer-push-prompt__main">
        <Bell size={18} aria-hidden className="trainer-push-prompt__icon" />
        <div>
          <p className="trainer-push-prompt__title">Статус заданий на телефон</p>
          <p className="trainer-push-prompt__text muted">
            Сотрудник принял или выполнил задачу — пришлём уведомление, когда браузер онлайн.
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
export function OwnerDispatchPushSettings({ clubId = '' }) {
  const push = useTrainerPush({ clubId, promptDismissKey: OWNER_PROMPT_DISMISS_KEY })

  if (!push.supported) {
    return (
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        Браузер не поддерживает push — статусы видны в списке заданий.
      </p>
    )
  }

  return (
    <div className="owner-dispatch-push-settings">
      <p className="muted" style={{ margin: '0 0 8px', fontSize: 13 }}>
        {push.subscribed
          ? 'Уведомления включены: «принял» и «выполнил» приходят на это устройство.'
          : 'Получать push, когда исполнитель принял или выполнил задание.'}
      </p>
      {push.error ? (
        <p className="trainer-push-settings__error" role="alert" style={{ margin: '0 0 8px' }}>
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
              {push.busy ? '…' : 'Переподключить'}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={push.busy} onClick={() => void push.unsubscribe()}>
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
    </div>
  )
}
