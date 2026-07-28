import { useHeartRateSessions } from '../context/HeartRateSessionsContext'
import { hrChipZoneClass } from '../lib/hr/hrSessionsCore'

/**
 * Чипы пульса в общей шапке: 1 = BPM; 2 live = фамилия+BPM.
 * lost/stale → тап = подключить снова; live → тап = отключить.
 */
export function HeaderHeartRate() {
  const {
    slots,
    showNames,
    disconnectClient,
    connectForClient,
    surname,
    bannerError,
    clearBannerError,
  } = useHeartRateSessions()

  const visible = slots.filter(
    (s) => s.status === 'live' || s.status === 'connecting' || s.status === 'lost',
  )
  if (visible.length === 0 && !bannerError) return null

  return (
    <div className="app-header__hr" role="status" aria-live="polite">
      {visible.map((slot) => {
        const lost = slot.status === 'lost' || (slot.status === 'live' && slot.stale)
        const bpmText =
          slot.bpm != null ? String(slot.bpm) : slot.status === 'connecting' ? '…' : '—'
        const pulseSec =
          slot.status === 'live' && !slot.stale && slot.bpm != null && slot.bpm > 0
            ? Math.max(0.35, Math.min(1.4, 60 / slot.bpm))
            : 1
        const name = surname(slot.clientName)
        const zoneClass = hrChipZoneClass(slot.zone)
        const title = lost
          ? `${showNames ? name + ': ' : ''}нет связи — нажмите «Снова»; ПКМ — убрать`
          : `${showNames ? name + ': ' : ''}${bpmText} уд/мин — нажмите, чтобы отключить`

        return (
          <button
            key={slot.clientId}
            type="button"
            className={[
              'app-header__hr-chip',
              zoneClass,
              lost ? 'app-header__hr-chip--stale' : '',
              slot.status === 'connecting' ? 'app-header__hr-chip--connecting' : '',
              lost ? 'app-header__hr-chip--lost' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={{ ['--hr-beat']: `${pulseSec}s` }}
            onClick={() => {
              if (lost || slot.status === 'lost') {
                void connectForClient({
                  clientId: slot.clientId,
                  clientName: slot.clientName,
                  maxHr: slot.maxHr,
                })
                return
              }
              if (slot.status === 'connecting') return
              disconnectClient(slot.clientId)
            }}
            onContextMenu={(e) => {
              if (!(lost || slot.status === 'lost')) return
              e.preventDefault()
              disconnectClient(slot.clientId)
            }}
            title={title}
            aria-label={
              lost
                ? showNames
                  ? `Пульс ${name}: нет связи. Подключить снова`
                  : 'Нет связи. Подключить снова'
                : showNames
                  ? `Пульс ${name}: ${bpmText}. Отключить`
                  : `Пульс ${bpmText}. Отключить`
            }
          >
            <span className="app-header__hr-ring" aria-hidden />
            {showNames ? <span className="app-header__hr-name">{name}</span> : null}
            <span className="app-header__hr-bpm">{lost && slot.bpm == null ? '!' : bpmText}</span>
            {lost ? <span className="app-header__hr-again">Снова</span> : null}
          </button>
        )
      })}
      {bannerError ? (
        <button
          type="button"
          className="app-header__hr-err"
          onClick={() => clearBannerError()}
          title={bannerError}
        >
          {bannerError}
        </button>
      ) : null}
    </div>
  )
}
