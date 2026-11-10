/**
 * Шторка-календарь: тренировки, вес, фазы цикла (если включён).
 * Телефон: крупные дни ≥44px, спокойные заливки из токенов.
 */
import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Settings2, X } from 'lucide-react'
import {
  CYCLE_SEX_BLOCKED_RU,
  buildCycleCalendarMonth,
  calendarMonthTitleRu,
  clientCanConfigureCycle,
  cyclePhaseLabelRu,
  publicClientCycle,
  shiftCalendarMonth,
} from '../../lib/client/clientCycleCalendarCore.js'
import { formatDateRu } from '../../lib/dateRu.js'

const WEEKDAYS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс']

/**
 * @param {{
 *   asOf: string
 *   sex?: 'male'|'female'|null
 *   cycle?: object|null
 *   memberships?: object|null
 *   nextSession?: object|null
 *   weights?: object[]|null
 *   onClose: () => void
 *   onOpenCycleSettings?: () => void
 * }} props
 */
export function ClientTrainingCalendarSheet({
  asOf,
  sex = null,
  cycle = null,
  memberships = null,
  nextSession = null,
  weights = null,
  onClose,
  onOpenCycleSettings,
}) {
  const start = asOf?.slice(0, 10) || '2026-01-01'
  const [y, m] = start.split('-').map(Number)
  const [{ year, month }, setCursor] = useState({ year: y, month: m })
  const pub = publicClientCycle(cycle)
  const canCycle = clientCanConfigureCycle(sex)

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const grid = useMemo(
    () =>
      buildCycleCalendarMonth({
        year,
        month,
        settings: cycle,
        memberships,
        nextSession,
        weights,
        todayIso: asOf,
      }),
    [year, month, cycle, memberships, nextSession, weights, asOf],
  )

  const [selectedIso, setSelectedIso] = useState(/** @type {string|null} */ (null))
  const selected = grid.weeks.flat().find((c) => c.iso === selectedIso && c.inMonth) ?? null

  return (
    <div className="client-progress-self client-cycle-cal" role="dialog" aria-modal="true" aria-label="Календарь тренировок">
      <button type="button" className="client-progress-self__backdrop" aria-label="Закрыть" onClick={onClose} />
      <div className="client-progress-self__panel client-cycle-cal__panel">
        <div className="client-progress-self__handle" aria-hidden />
        <header className="client-progress-self__head">
          <h2>Календарь</h2>
          <button type="button" className="client-progress-self__close btn-touch" aria-label="Закрыть" onClick={onClose}>
            <X size={20} aria-hidden />
          </button>
        </header>

        <div className="client-cycle-cal__nav">
          <button
            type="button"
            className="btn btn-ghost btn-icon-square btn-touch"
            aria-label="Предыдущий месяц"
            onClick={() => setCursor((c) => shiftCalendarMonth(c.year, c.month, -1))}
          >
            <ChevronLeft size={20} aria-hidden />
          </button>
          <strong>{calendarMonthTitleRu(year, month)}</strong>
          <button
            type="button"
            className="btn btn-ghost btn-icon-square btn-touch"
            aria-label="Следующий месяц"
            onClick={() => setCursor((c) => shiftCalendarMonth(c.year, c.month, 1))}
          >
            <ChevronRight size={20} aria-hidden />
          </button>
        </div>

        <div className="client-cycle-cal__weekdays" aria-hidden>
          {WEEKDAYS.map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <div className="client-cycle-cal__grid" role="grid" aria-label={calendarMonthTitleRu(year, month)}>
          {grid.weeks.map((week, wi) => (
            <div key={wi} className="client-cycle-cal__week" role="row">
              {week.map((cell, di) => {
                if (!cell.inMonth) {
                  return <span key={di} className="client-cycle-cal__cell client-cycle-cal__cell--empty" role="gridcell" />
                }
                const phaseClass = cell.phase ? ` client-cycle-cal__cell--${cell.phase}` : ''
                const sel = selectedIso === cell.iso ? ' client-cycle-cal__cell--selected' : ''
                const today = cell.isToday ? ' client-cycle-cal__cell--today' : ''
                return (
                  <button
                    key={cell.iso}
                    type="button"
                    role="gridcell"
                    className={`client-cycle-cal__cell${phaseClass}${sel}${today}`}
                    aria-label={`${formatDateRu(cell.iso)}${cell.phase ? `, ${cyclePhaseLabelRu(cell.phase)}` : ''}${
                      cell.training === 'done'
                        ? ', тренировка'
                        : cell.training === 'planned'
                          ? ', запланирована'
                          : cell.training === 'noshow'
                            ? ', неявка'
                            : ''
                    }${cell.weightKg != null ? `, вес ${cell.weightKg}` : ''}`}
                    onClick={() => setSelectedIso(cell.iso)}
                  >
                    <span className="client-cycle-cal__day">{cell.day}</span>
                    <span className="client-cycle-cal__marks" aria-hidden>
                      {cell.training === 'done' ? <i className="client-cycle-cal__dot client-cycle-cal__dot--done" /> : null}
                      {cell.training === 'planned' ? <i className="client-cycle-cal__dot client-cycle-cal__dot--planned" /> : null}
                      {cell.training === 'noshow' ? <i className="client-cycle-cal__dot client-cycle-cal__dot--noshow" /> : null}
                      {cell.weightKg != null ? <i className="client-cycle-cal__dot client-cycle-cal__dot--weight" /> : null}
                    </span>
                  </button>
                )
              })}
            </div>
          ))}
        </div>

        <div className="client-cycle-cal__legend">
          <span>
            <i className="client-cycle-cal__dot client-cycle-cal__dot--done" /> была
          </span>
          <span>
            <i className="client-cycle-cal__dot client-cycle-cal__dot--planned" /> будет
          </span>
          <span>
            <i className="client-cycle-cal__dot client-cycle-cal__dot--weight" /> вес
          </span>
          {pub.enabled ? (
            <div className="client-cycle-cal__phases" aria-label="Фазы цикла">
              <span className="client-cycle-cal__phase-swatch">
                <i className="period" aria-hidden /> месячные
              </span>
              <span className="client-cycle-cal__phase-swatch">
                <i className="follicular" aria-hidden /> фолликул.
              </span>
              <span className="client-cycle-cal__phase-swatch">
                <i className="ovulation" aria-hidden /> овуляция
              </span>
              <span className="client-cycle-cal__phase-swatch">
                <i className="luteal" aria-hidden /> лютеин.
              </span>
              <span className="client-me-muted">{grid.legendHint}</span>
            </div>
          ) : onOpenCycleSettings ? (
            <button
              type="button"
              className="btn btn-ghost btn-icon-square btn-touch client-cycle-cal__setup"
              title={canCycle ? 'Настроить цикл' : CYCLE_SEX_BLOCKED_RU}
              aria-label={canCycle ? 'Настроить цикл' : CYCLE_SEX_BLOCKED_RU}
              disabled={!canCycle}
              onClick={canCycle ? onOpenCycleSettings : undefined}
            >
              <Settings2 size={20} aria-hidden />
            </button>
          ) : null}
        </div>

        {selected ? (
          <p className="client-cycle-cal__detail" role="status">
            <strong>{formatDateRu(selected.iso)}</strong>
            {selected.phase ? ` · ${cyclePhaseLabelRu(selected.phase)}` : ''}
            {selected.training === 'done'
              ? ' · тренировка была'
              : selected.training === 'planned'
                ? ' · запланирована'
                : selected.training === 'noshow'
                  ? ' · неявка'
                  : ''}
            {selected.weightKg != null ? ` · ${String(selected.weightKg).replace('.', ',')} кг` : ''}
          </p>
        ) : (
          <p className="client-cycle-cal__detail client-me-muted" role="note">
            Нажмите день — детали
          </p>
        )}
      </div>
    </div>
  )
}
