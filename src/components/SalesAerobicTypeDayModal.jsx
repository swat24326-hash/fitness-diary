import { createPortal } from 'react-dom'
import { useMemo } from 'react'
import { ModalHeader } from './ModalHeader.jsx'
import { buildAerobicTypeDayBreakdown } from '../lib/admin/aerobicSalesMatrix.js'
import { formatDateRu } from '../lib/dateRu.js'

/**
 * Окно расшифровки АЗ по дням (как «Тренировки абонемента»).
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   typeId: string | null,
 *   typeCode: string,
 *   monthLabel: string,
 *   monthRows: Array<Record<string, unknown>>,
 *   onOpenDay?: (iso: string) => void,
 * }} props
 */
export function SalesAerobicTypeDayModal({
  open,
  onClose,
  typeId,
  typeCode,
  monthLabel,
  monthRows,
  onOpenDay,
}) {
  const days = useMemo(
    () => (open ? buildAerobicTypeDayBreakdown(monthRows, typeId) : []),
    [open, monthRows, typeId],
  )
  const total = useMemo(() => days.reduce((s, d) => s + d.count, 0), [days])

  if (!open) return null

  const title = `Аэробный зал · ${typeCode || 'Итого'}`

  return createPortal(
    <div
      className="modal-overlay modal-overlay--center modal-overlay--membership-view"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div className="modal-panel modal-panel--membership-view" onClick={(e) => e.stopPropagation()}>
        <div className="membership-view sales-aerobic-day-modal">
          <div className="membership-view__header">
            <ModalHeader title={title} onClose={onClose} />
            <p className="muted membership-view__period">
              {monthLabel ? (
                <>
                  {monthLabel}
                  {' · '}
                </>
              ) : null}
              всего <strong style={{ color: 'var(--text)' }}>{total}</strong>
            </p>
          </div>

          <div className="membership-view__body">
            {days.length === 0 ? (
              <p className="muted membership-view__empty">В этом месяце по типу нет записей.</p>
            ) : (
              <ul className="membership-training-list sales-aerobic-day-modal__list">
                {days.map((row) => (
                  <li key={row.date} className="membership-training-list__item sales-aerobic-day-modal__item">
                    {typeof onOpenDay === 'function' ? (
                      <button
                        type="button"
                        className="sales-aerobic-day-modal__day-btn"
                        onClick={() => {
                          onOpenDay(row.date)
                          onClose()
                        }}
                      >
                        <strong>{formatDateRu(row.date)}</strong>
                        <span className="sales-aerobic-day-modal__count" aria-label={`${row.count} человек`}>
                          {row.count}
                        </span>
                      </button>
                    ) : (
                      <div className="sales-aerobic-day-modal__day-btn sales-aerobic-day-modal__day-btn--static">
                        <strong>{formatDateRu(row.date)}</strong>
                        <span className="sales-aerobic-day-modal__count">{row.count}</span>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
