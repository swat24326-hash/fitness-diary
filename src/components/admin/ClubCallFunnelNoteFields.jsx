import { useId } from 'react'
import {
  CLUB_CALL_CALLBACK_HORIZONS,
  CLUB_CALL_FUNNEL_CHIPS,
  getClubCallFunnelChip,
  isClubCallFunnelNoteReady,
  resolveClubCallCallbackOn,
} from '../../lib/admin/clubCallFunnelChipsCore.js'
import { CLUB_CALL_LOG_STAFF_NOTE_MAX } from '../../lib/admin/clubCallLogCore.js'
import { formatDateRu, todayInTimeZoneIso } from '../../lib/dateRu.js'

/**
 * Поля пометки: чипы воронки + опц. дата + textarea (controlled).
 * @param {{
 *   draft: string,
 *   onDraftChange: (v: string) => void,
 *   chipId: string | null,
 *   onPickChip: (chipId: string | null) => void,
 *   callbackOn: string | null,
 *   horizonId: string | null,
 *   customDate: string,
 *   onPickHorizon: (horizonId: string) => void,
 *   onCustomDateChange: (iso: string) => void,
 *   disabled?: boolean,
 *   compact?: boolean,
 *   fieldId?: string,
 * }} props
 */
export function ClubCallFunnelNoteFields({
  draft,
  onDraftChange,
  chipId,
  onPickChip,
  callbackOn,
  horizonId,
  customDate,
  onPickHorizon,
  onCustomDateChange,
  disabled = false,
  compact = false,
  fieldId: fieldIdProp,
}) {
  const autoId = useId()
  const fieldId = fieldIdProp || autoId
  const horizonHintId = useId()
  const asOf = todayInTimeZoneIso()
  const chip = getClubCallFunnelChip(chipId)
  const needsDate = Boolean(chip?.needsCallbackOn)
  const openChips = CLUB_CALL_FUNNEL_CHIPS.filter((c) => c.kind === 'open')
  const closeChips = CLUB_CALL_FUNNEL_CHIPS.filter((c) => c.kind === 'close')
  const previewDate =
    needsDate && horizonId && horizonId !== 'custom'
      ? resolveClubCallCallbackOn(asOf, horizonId, '')
      : callbackOn

  return (
    <div className={`club-call-funnel-fields${compact ? ' club-call-funnel-fields--compact' : ''}`}>
      <div className="club-call-funnel-fields__group" role="group" aria-label="Следующий шаг">
        <p className="club-call-funnel-fields__group-title">Дальше по воронке</p>
        <div className="club-call-sheet__chips club-call-funnel-fields__chips">
          {openChips.map((c) => {
            const on = chipId === c.id
            return (
              <button
                key={c.id}
                type="button"
                className={`club-call-sheet__chip${on ? ' club-call-sheet__chip--on' : ''}`}
                disabled={disabled}
                aria-pressed={on}
                onClick={() => onPickChip?.(chipId === c.id ? null : c.id)}
              >
                {c.label}
              </button>
            )
          })}
        </div>
      </div>
      <div className="club-call-funnel-fields__group" role="group" aria-label="Закрытие">
        <p className="club-call-funnel-fields__group-title">Закрыть ветку</p>
        <div className="club-call-sheet__chips club-call-funnel-fields__chips">
          {closeChips.map((c) => {
            const on = chipId === c.id
            return (
              <button
                key={c.id}
                type="button"
                className={`club-call-sheet__chip club-call-sheet__chip--close${on ? ' club-call-sheet__chip--on' : ''}`}
                disabled={disabled}
                aria-pressed={on}
                onClick={() => onPickChip?.(chipId === c.id ? null : c.id)}
              >
                {c.label}
              </button>
            )
          })}
        </div>
      </div>

      {needsDate ? (
        <div className="club-call-funnel-fields__horizons" role="radiogroup" aria-labelledby={horizonHintId}>
          <p id={horizonHintId} className="club-call-funnel-fields__group-title">
            Когда перезвонить?
          </p>
          <div className="club-call-sheet__chips">
            {CLUB_CALL_CALLBACK_HORIZONS.map((h) => {
              const on = horizonId === h.id
              return (
                <button
                  key={h.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  className={`club-call-sheet__chip club-call-sheet__chip--horizon${on ? ' club-call-sheet__chip--on' : ''}`}
                  disabled={disabled}
                  onClick={() => onPickHorizon?.(h.id)}
                >
                  {h.label}
                </button>
              )
            })}
          </div>
          {horizonId === 'custom' ? (
            <label className="field club-call-funnel-fields__date">
              <span className="label">Дата *</span>
              <input
                className="input"
                type="date"
                min={asOf}
                value={customDate}
                disabled={disabled}
                onChange={(e) => onCustomDateChange?.(e.target.value)}
              />
            </label>
          ) : previewDate ? (
            <p className="muted club-call-funnel-fields__preview">До {formatDateRu(previewDate)}</p>
          ) : null}
        </div>
      ) : null}

      <label className="club-call-note__label" htmlFor={fieldId}>
        Пометка к звонку
      </label>
      <textarea
        id={fieldId}
        className="club-call-note__input"
        rows={compact ? 2 : 3}
        maxLength={CLUB_CALL_LOG_STAFF_NOTE_MAX}
        value={draft}
        onChange={(e) => onDraftChange?.(e.target.value)}
        placeholder="Чип или свой текст: следующий шаг по клиенту"
        disabled={disabled}
      />
      {!isClubCallFunnelNoteReady({
        chipId,
        callbackOn,
        customText: draft,
      }) &&
      chipId === 'callback_later' ? (
        <p className="muted club-call-funnel-fields__hint">Укажите дату перезвона.</p>
      ) : null}
    </div>
  )
}
