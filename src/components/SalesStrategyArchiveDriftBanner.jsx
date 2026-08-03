import { AlertTriangle, RefreshCw } from 'lucide-react'
import { formatRub } from '../lib/admin/salesReportCore.js'
import { formatDateRu } from '../lib/dateRu.js'
import { HALL_RENEWALS_HALLS } from '../lib/admin/salesPlanHallRenewalsSuggestCore.js'

const HALL_LABEL = Object.fromEntries(HALL_RENEWALS_HALLS.map((h) => [h.hall, h.label]))
const PREVIEW_LIMIT = 7

/**
 * @param {{
 *   drift: object,
 *   onRecalculate?: () => void,
 *   busy?: boolean,
 *   disabled?: boolean,
 * }} props
 */
export function SalesStrategyArchiveDriftBanner({
  drift,
  onRecalculate,
  busy = false,
  disabled = false,
}) {
  if (!drift?.ok || !(drift.count > 0)) return null

  const isWarn = drift.tone === 'warn'
  const shown = (drift.rows ?? []).slice(0, PREVIEW_LIMIT)
  const more = Math.max(0, drift.count - shown.length)

  return (
    <aside
      className={`sales-archive-drift${isWarn ? ' sales-archive-drift--warn' : ' sales-archive-drift--info'}`}
      role="status"
      aria-label="Коррекция стратегии из-за архива"
    >
      <header className="sales-archive-drift__head">
        <AlertTriangle size={18} aria-hidden className="sales-archive-drift__icon" />
        <div className="sales-archive-drift__head-text">
          <h4 className="sales-archive-drift__title">
            {isWarn
              ? 'Стратегия сдвинулась: клиенты в архиве'
              : 'В архиве есть закрытия этого месяца'}
          </h4>
          <p className="sales-archive-drift__lead">
            Архив в ДК-пакете не считаем — в цифры выше они уже не входят.
            {isWarn && drift.lostDkRub > 0 ? (
              <>
                {' '}
                После прошлого расчёта ушли в архив ≈ <strong>{formatRub(drift.lostDkRub)}</strong>{' '}
                ДК ({drift.count} чел.). Нажмите «Пересчитать пакет», чтобы обновить список и
                добор до ур. 3 (или доберите УК ≈ {formatRub(drift.suggestUkRub)}).
              </>
            ) : (
              <>
                {' '}
                Справка: {drift.count} чел. с концом абона в месяце плана лежат в архиве. Это не
                ошибка и не «вне плана» — пересчёт из‑за них не нужен.
              </>
            )}
          </p>
        </div>
        {isWarn && onRecalculate ? (
          <button
            type="button"
            className="btn btn-secondary btn-touch sales-archive-drift__cta"
            disabled={busy || disabled}
            onClick={() => onRecalculate()}
          >
            <RefreshCw size={16} aria-hidden style={{ marginRight: 6, verticalAlign: -2 }} />
            {busy ? 'Считаем…' : 'Пересчитать пакет'}
          </button>
        ) : null}
      </header>

      {shown.length ? (
        <ul className="sales-archive-drift__list">
          {shown.map((row) => (
            <li key={row.clientId} className="sales-archive-drift__row">
              <span className="sales-archive-drift__hall">{HALL_LABEL[row.hall] || row.hall}</span>
              <span className="sales-archive-drift__name">{row.clientName}</span>
              <span className="muted sales-archive-drift__date">{formatDateRu(row.endDate)}</span>
              {row.lostDkRub > 0 ? (
                <span className="sales-archive-drift__rub">−{formatRub(row.lostDkRub)}</span>
              ) : (
                <span className="muted sales-archive-drift__rub">архив</span>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      {more > 0 ? <p className="muted sales-archive-drift__more">ещё {more}</p> : null}
    </aside>
  )
}
