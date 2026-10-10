import { RefreshCw, WifiOff } from 'lucide-react'

/** Карточка состояния телефона: загрузка, ошибка / нет сети, пусто. */
export function CoachStatus({ icon: Icon, spin = false, title, hint, children }) {
  return (
    <section className="os-empty-card coach-status" role="status">
      {Icon ? <Icon size={30} aria-hidden className={`os-empty-card__icon${spin ? ' icon-spin' : ''}`} /> : null}
      {title ? <h2 className="os-empty-card__title">{title}</h2> : null}
      {hint ? <p className="os-empty-card__hint">{hint}</p> : null}
      {children}
    </section>
  )
}

/** Загрузка или ошибка с «Повторить»; null — данные готовы. */
export function CoachLoadState({ status, error, onRetry }) {
  if (status === 'loading') return <CoachStatus icon={RefreshCw} spin title="Загружаем…" />
  if (status !== 'error') return null
  return (
    <CoachStatus icon={WifiOff} title="Не загрузилось" hint={error}>
      <button type="button" className="btn btn-secondary btn-touch" onClick={onRetry}>
        Повторить
      </button>
    </CoachStatus>
  )
}
