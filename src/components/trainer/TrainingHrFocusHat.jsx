import { Activity, Bluetooth, BluetoothOff, RefreshCw } from 'lucide-react'

/**
 * Кнопка подключения / фокус-блок пульса в шапке тренировки.
 *
 * @param {{
 *   hr: ReturnType<typeof import('../../hooks/useHeartRateSession').useHeartRateSession>,
 *   membershipLabel?: string,
 *   daysLabel?: string,
 *   weightSlot?: React.ReactNode,
 *   idle?: boolean,
 * }} props
 */
export function TrainingHrFocusHat({ hr, membershipLabel, daysLabel, weightSlot, idle = false }) {
  const live = hr.status === 'live'
  const connecting = hr.status === 'connecting'
  const bpmText = hr.bpm != null ? String(hr.bpm) : '—'
  const pulseSec =
    live && hr.bpm != null && hr.bpm > 0 ? Math.max(0.35, Math.min(1.4, 60 / hr.bpm)) : 1

  if (idle && !live) {
    return (
      <div className="training-hr-idle">
        <button
          type="button"
          className="btn btn-secondary btn-icon-square btn-sm training-hr-idle__btn"
          onClick={() => void hr.connect()}
          disabled={connecting || !hr.supported}
          aria-label={
            hr.remembered
              ? `Подключить пульс${hr.remembered.name ? `: ${hr.remembered.name}` : ''}`
              : 'Подключить пульсометр'
          }
          title={
            !hr.supported
              ? 'Bluetooth-пульс доступен в Chrome на планшете'
              : hr.remembered
                ? `Пульс — ${hr.remembered.name}`
                : 'Подключить пульсометр'
          }
        >
          {connecting ? <RefreshCw size={18} className="training-hr-spin" aria-hidden /> : <Activity size={18} aria-hidden />}
        </button>
        {hr.remembered ? (
          <button
            type="button"
            className="btn btn-ghost btn-icon-square btn-sm training-hr-idle__other"
            onClick={() => void hr.pickOtherDevice()}
            disabled={connecting}
            aria-label="Другой датчик"
            title="Другой датчик"
          >
            <Bluetooth size={16} aria-hidden />
          </button>
        ) : null}
        {hr.error ? (
          <span className="training-hr-idle__err" role="status">
            {hr.error}
          </span>
        ) : null}
      </div>
    )
  }

  if (!live) return null

  return (
    <div
      className={`training-hr-focus${hr.stale ? ' training-hr-focus--stale' : ''}`}
      style={{ ['--hr-beat']: `${pulseSec}s` }}
      role="status"
      aria-live="polite"
      aria-label={`Пульс ${bpmText} ударов в минуту`}
    >
      <div className="training-hr-focus__orb" aria-hidden>
        <span className="training-hr-focus__ring" />
        <span className="training-hr-focus__ring training-hr-focus__ring--delay" />
        <div className="training-hr-focus__bpm">
          <span className="training-hr-focus__value">{bpmText}</span>
          <span className="training-hr-focus__unit">уд/мин</span>
        </div>
      </div>

      <div className="training-hr-focus__side">
        <div className="training-hr-focus__meta">
          <span className="training-hr-focus__status">
            {hr.stale ? 'Нет сигнала' : 'Связь'}
            {hr.deviceName ? ` · ${hr.deviceName}` : ''}
          </span>
          <div className="training-hr-focus__chips" aria-label="Параметры тренировки">
            {membershipLabel ? (
              <span className="training-hr-chip">
                <span className="training-hr-chip__k">Трен.</span>
                <span className="training-hr-chip__v">{membershipLabel}</span>
              </span>
            ) : null}
            {daysLabel != null ? (
              <span className="training-hr-chip">
                <span className="training-hr-chip__k">Дней</span>
                <span className="training-hr-chip__v">{daysLabel}</span>
              </span>
            ) : null}
            {weightSlot ? <div className="training-hr-chip training-hr-chip--weight">{weightSlot}</div> : null}
          </div>
        </div>
        <div className="training-hr-focus__actions">
          <button
            type="button"
            className="btn btn-ghost btn-icon-square btn-sm"
            onClick={() => void hr.pickOtherDevice()}
            aria-label="Другой датчик"
            title="Другой датчик"
          >
            <Bluetooth size={16} aria-hidden />
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-icon-square btn-sm"
            onClick={() => hr.disconnect()}
            aria-label="Отключить пульсометр"
            title="Отключить"
          >
            <BluetoothOff size={16} aria-hidden />
          </button>
        </div>
      </div>
    </div>
  )
}
