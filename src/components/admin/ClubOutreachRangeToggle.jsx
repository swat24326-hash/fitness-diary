/**
 * День ◀▶ или «Всё время» (до max lookback) для истории связи клиента.
 */
import { ClubOutreachDayStepper } from './ClubOutreachDayStepper.jsx'
import {
  CLIENT_OUTREACH_RANGE_ALL,
  CLIENT_OUTREACH_RANGE_DAY,
  normalizeClientOutreachRangeMode,
} from '../../lib/admin/clientOutreachHistoryRangeCore.js'
import '../../styles/club-call.css'

/**
 * @param {{
 *   rangeMode: 'day' | 'all',
 *   day: string,
 *   onRangeModeChange: (mode: 'day' | 'all') => void,
 *   onDayChange: (iso: string) => void,
 *   disabled?: boolean,
 *   lookbackDays?: number,
 * }} props
 */
export function ClubOutreachRangeToggle({
  rangeMode,
  day,
  onRangeModeChange,
  onDayChange,
  disabled = false,
  lookbackDays = 90,
}) {
  const mode = normalizeClientOutreachRangeMode(rangeMode)
  const isAll = mode === CLIENT_OUTREACH_RANGE_ALL

  return (
    <div
      className={`club-outreach-range${isAll ? ' club-outreach-range--all' : ''}`}
      role="group"
      aria-label="Период истории"
    >
      <ClubOutreachDayStepper
        value={day}
        onChange={(iso) => {
          onRangeModeChange(CLIENT_OUTREACH_RANGE_DAY)
          onDayChange(iso)
        }}
        disabled={disabled}
        maxLookbackDays={lookbackDays}
      />
      <button
        type="button"
        className={`btn btn-touch club-outreach-range__all${isAll ? ' club-outreach-range__all--on' : ' btn-ghost'}`}
        disabled={disabled}
        aria-pressed={isAll}
        title={
          isAll
            ? 'Сейчас «всё время» — нажмите ещё раз или выберите день'
            : `Все записи за последние ${lookbackDays} дней`
        }
        onClick={() =>
          onRangeModeChange(isAll ? CLIENT_OUTREACH_RANGE_DAY : CLIENT_OUTREACH_RANGE_ALL)
        }
      >
        Всё время
      </button>
    </div>
  )
}
