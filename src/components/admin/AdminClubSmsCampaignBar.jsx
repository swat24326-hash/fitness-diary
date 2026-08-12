import { MessageSquareText, X } from 'lucide-react'
import '../../styles/club-sms-campaign.css'

/**
 * Панель режима массовых SMS на доске клиентов.
 * Idle — одна кнопка; active — компактная планка выбора.
 *
 * @param {{
 *   active: boolean,
 *   configured: boolean | null,
 *   selectedCount: number,
 *   eligibleCount: number,
 *   skippedNoPhone: number,
 *   running?: boolean,
 *   progressLabel?: string,
 *   onEnter: () => void,
 *   onExit: () => void,
 *   onSelectAll: () => void,
 *   onClear: () => void,
 *   onCompose: () => void,
 *   onCancelRun?: () => void,
 * }} props
 */
export function AdminClubSmsCampaignBar({
  active,
  configured,
  selectedCount,
  eligibleCount,
  skippedNoPhone,
  running = false,
  progressLabel = '',
  onEnter,
  onExit,
  onSelectAll,
  onClear,
  onCompose,
  onCancelRun,
}) {
  const ready = configured === true

  if (!active) {
    return (
      <div className="club-sms-campaign-bar club-sms-campaign-bar--idle">
        <button
          type="button"
          className="btn btn-ghost btn-touch club-sms-campaign-bar__cta"
          disabled={!ready}
          onClick={() => onEnter?.()}
          title={
            ready
              ? 'Выбрать клиентов текущего списка и отправить одно SMS всем'
              : 'Сначала настройте Мои Звонки в «Max и SMS»'
          }
          aria-label="Массовые SMS"
        >
          <MessageSquareText size={18} aria-hidden />
          Массовые SMS
        </button>
      </div>
    )
  }

  return (
    <div
      className={`club-sms-campaign-bar club-sms-campaign-bar--active${running ? ' club-sms-campaign-bar--running' : ''}`}
      role="region"
      aria-label="Массовые SMS"
    >
      <div className="club-sms-campaign-bar__main">
        <strong className="club-sms-campaign-bar__title">
          {running ? 'Отправка…' : 'SMS'}
        </strong>
        <span className="club-sms-campaign-bar__meta">
          {running
            ? progressLabel || 'Очередь'
            : `${selectedCount}/${eligibleCount}${
                skippedNoPhone > 0 ? ` · без тел. ${skippedNoPhone}` : ''
              }`}
        </span>
      </div>
      <div className="club-sms-campaign-bar__actions">
        {running ? (
          <button type="button" className="btn btn-ghost btn-touch" onClick={() => onCancelRun?.()}>
            Стоп
          </button>
        ) : (
          <>
            <button
              type="button"
              className="btn btn-ghost btn-touch"
              disabled={eligibleCount === 0}
              onClick={() => onSelectAll?.()}
              title="Выбрать всех с телефоном в текущем списке"
            >
              Все
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-touch"
              disabled={selectedCount === 0}
              onClick={() => onClear?.()}
              title="Снять все галочки"
            >
              Снять
            </button>
            <button
              type="button"
              className="btn btn-primary btn-touch"
              disabled={selectedCount === 0}
              onClick={() => onCompose?.()}
              title="Текст и подтверждение отправки"
            >
              Далее
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-icon-square btn-touch"
              aria-label="Выйти из массовых SMS"
              title="Выйти"
              onClick={() => onExit?.()}
            >
              <X size={18} aria-hidden />
            </button>
          </>
        )}
      </div>
    </div>
  )
}
