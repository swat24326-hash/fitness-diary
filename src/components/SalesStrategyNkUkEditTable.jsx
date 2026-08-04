import { formatRub } from '../lib/admin/salesReportCore.js'
import { HALL_RENEWALS_HALLS } from '../lib/admin/salesPlanHallRenewalsSuggestCore.js'
import { describeTopUpPackBudgetDeltaRu } from '../lib/admin/salesStrategyNkUkEditCore.js'
import { strategyNkUkHowWeCountRu } from '../lib/admin/salesStrategyNkUkHowWeCountCore.js'

/**
 * Утверждение НК/УК по направлениям ПЗ / ТЗ / АЗ.
 *
 * @param {{
 *   topUpPack: object,
 *   disabled?: boolean,
 *   onNkUkChange: (hall: 'pz'|'tz'|'az', category: 'nk'|'uk', field: 'count'|'avg_check', value: string) => void,
 * }} props
 */
export function SalesStrategyNkUkEditTable({ topUpPack, disabled = false, onNkUkChange }) {
  if (!topUpPack?.ok) return null

  const how = strategyNkUkHowWeCountRu(topUpPack)
  const deltaTone = topUpPack.fittedToBudget ? 'ok' : 'warn'

  return (
    <div className="sales-strategy-nkuk">
      <details className="sales-strategy-nkuk__how">
        <summary>{how.title}</summary>
        <ol className="sales-strategy-nkuk__how-list">
          {how.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </details>

      <p className="muted sales-strategy-nkuk__lead">
        По каждому залу правьте только <strong>НК</strong> и <strong>УК</strong> (шт и ср. чек).{' '}
        <strong>ДК</strong> — из закрытий, только просмотр.
        {topUpPack.manualNkUk ? ' Есть ручные правки.' : ''}
      </p>

      <div className="sales-strategy-nkuk__halls" role="list">
        {HALL_RENEWALS_HALLS.map((def) => {
          const hall = def.hall
          const row = topUpPack.byHall?.[hall]
          const nk = topUpPack.cells?.[`${hall}_nk`] ?? {}
          const uk = topUpPack.cells?.[`${hall}_uk`] ?? {}
          if (!row) return null
          return (
            <article
              key={hall}
              className="sales-strategy-nkuk__hall"
              role="listitem"
              aria-label={`Направление ${def.label}`}
            >
              <header className="sales-strategy-nkuk__hall-head">
                <h4 className="sales-strategy-nkuk__hall-title">{def.label}</h4>
                <strong className="sales-strategy-nkuk__hall-total">{formatRub(row.total)}</strong>
              </header>

              <div className="sales-strategy-nkuk__dk-row muted">
                <span>ДК (закрытия)</span>
                <span>
                  {Math.trunc(Number(topUpPack.cells?.[`${hall}_dk`]?.count) || 0) > 0
                    ? `${Math.trunc(Number(topUpPack.cells[`${hall}_dk`].count))} шт · `
                    : ''}
                  {formatRub(row.dk)}
                </span>
              </div>

              <div className="sales-strategy-nkuk__cats">
                <div className="sales-strategy-nkuk__cat">
                  <span className="sales-strategy-nkuk__cat-label">НК</span>
                  <label className="sales-strategy-nkuk__ctl">
                    шт
                    <input
                      type="text"
                      inputMode="numeric"
                      className="sales-strategy-nkuk__input"
                      aria-label={`${def.label} НК количество`}
                      value={nk.count > 0 ? String(nk.count) : ''}
                      disabled={disabled}
                      placeholder="0"
                      onChange={(e) => onNkUkChange(hall, 'nk', 'count', e.target.value)}
                    />
                  </label>
                  <label className="sales-strategy-nkuk__ctl">
                    ср. чек
                    <input
                      type="text"
                      inputMode="decimal"
                      className="sales-strategy-nkuk__input"
                      aria-label={`${def.label} НК средний чек`}
                      value={nk.avg_check > 0 ? String(nk.avg_check) : ''}
                      disabled={disabled}
                      placeholder="0"
                      onChange={(e) => onNkUkChange(hall, 'nk', 'avg_check', e.target.value)}
                    />
                  </label>
                  <span className="sales-strategy-nkuk__cat-rub">{formatRub(nk.amount || 0)}</span>
                </div>

                <div className="sales-strategy-nkuk__cat">
                  <span className="sales-strategy-nkuk__cat-label">УК</span>
                  <label className="sales-strategy-nkuk__ctl">
                    шт
                    <input
                      type="text"
                      inputMode="numeric"
                      className="sales-strategy-nkuk__input"
                      aria-label={`${def.label} УК количество`}
                      value={uk.count > 0 ? String(uk.count) : ''}
                      disabled={disabled}
                      placeholder="0"
                      onChange={(e) => onNkUkChange(hall, 'uk', 'count', e.target.value)}
                    />
                  </label>
                  <label className="sales-strategy-nkuk__ctl">
                    ср. чек
                    <input
                      type="text"
                      inputMode="decimal"
                      className="sales-strategy-nkuk__input"
                      aria-label={`${def.label} УК средний чек`}
                      value={uk.avg_check > 0 ? String(uk.avg_check) : ''}
                      disabled={disabled}
                      placeholder="0"
                      onChange={(e) => onNkUkChange(hall, 'uk', 'avg_check', e.target.value)}
                    />
                  </label>
                  <span className="sales-strategy-nkuk__cat-rub">{formatRub(uk.amount || 0)}</span>
                </div>
              </div>
            </article>
          )
        })}
      </div>

      <footer className="sales-strategy-nkuk__foot">
        <div className="sales-strategy-nkuk__pack-total">
          <span className="sales-strategy-nkuk__pack-label">Пакет залов</span>
          <strong>{formatRub(topUpPack.totalAmount)}</strong>
        </div>
        <p className={`sales-strategy-nkuk__delta sales-strategy-nkuk__delta--${deltaTone}`} role="status">
          {describeTopUpPackBudgetDeltaRu(topUpPack)}
          {(Number(topUpPack.budget) || 0) > 0 ? (
            <>
              {' '}
              Цель залов {formatRub(topUpPack.budget)}
              {(Number(topUpPack.planExtraRub) || 0) > 0
                ? ` · доп. ${formatRub(topUpPack.planExtraRub)}`
                : ''}
              {(Number(topUpPack.level3Budget) || 0) > 0
                ? ` · ур. 3 ${formatRub(topUpPack.level3Budget)}`
                : ''}
              .
            </>
          ) : null}
        </p>
      </footer>
    </div>
  )
}
