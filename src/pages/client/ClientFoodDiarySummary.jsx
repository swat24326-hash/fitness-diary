import {
  buildFoodDiarySummary,
  formatNutrientValueRu,
} from '../../lib/client/foodDiarySummaryCore.js'
import { sumFoodDiaryDay } from '../../lib/client/foodDiaryDayCore.js'

function Bar({ pct, tone = 'accent' }) {
  const w = Math.max(0, Math.min(100, pct))
  return (
    <div className="food-diary-summary__bar" aria-hidden>
      <span
        className={`food-diary-summary__bar-fill food-diary-summary__bar-fill--${tone}`}
        style={{ width: `${w}%` }}
      />
    </div>
  )
}

/**
 * Сводка дня.
 * @param {'full'|'compact'} [variant] — compact: как низ дневника FatSecret (ккал + БЖУ)
 */
export function ClientFoodDiarySummary({ entries = [], targets, variant = 'full' }) {
  const totals = sumFoodDiaryDay(entries)
  const summary = buildFoodDiarySummary(totals, targets)
  const remaining = Math.round(summary.kcal.target - summary.kcal.value)

  if (variant === 'compact') {
    return (
      <section className="food-diary-summary food-diary-summary--compact card" aria-label="Итог за день">
        <div className="food-diary-summary__kcal">
          <div className="food-diary-summary__kcal-row">
            <span className="food-diary-summary__kcal-value">
              {formatNutrientValueRu(summary.kcal.value, { integer: true })}
            </span>
            <span className="food-diary-summary__kcal-of muted">
              / {summary.kcal.target} ккал
            </span>
          </div>
          <Bar pct={summary.kcal.pct} />
          <p className="food-diary-summary__remain muted">
            {remaining >= 0 ? `Осталось ${remaining} ккал` : `Сверх цели на ${Math.abs(remaining)} ккал`}
          </p>
        </div>
        <div className="food-diary-bju" aria-label="Белки, жиры, углеводы">
          {summary.macros.map((m) => (
            <span key={m.key} className="food-diary-bju__item">
              <span className="food-diary-bju__letter">{m.short}</span>
              <span className="food-diary-bju__num">{formatNutrientValueRu(m.value)}</span>
            </span>
          ))}
        </div>
      </section>
    )
  }

  return (
    <section className="food-diary-summary card" aria-label="Сводка за день">
      <header className="food-diary-summary__head">
        <h2 className="food-diary-summary__title">Сводка</h2>
        <p className="food-diary-summary__sub muted">к цели дня · ориентир</p>
      </header>

      <div className="food-diary-summary__kcal">
        <div className="food-diary-summary__kcal-row">
          <span className="food-diary-summary__kcal-value">
            {formatNutrientValueRu(summary.kcal.value, { integer: true })}
          </span>
          <span className="food-diary-summary__kcal-of muted">
            / {summary.kcal.target} ккал
          </span>
        </div>
        <Bar pct={summary.kcal.pct} />
      </div>

      <div className="food-diary-bju" aria-label="Белки, жиры, углеводы">
        {summary.macros.map((m) => (
          <span key={m.key} className="food-diary-bju__item">
            <span className="food-diary-bju__letter">{m.short}</span>
            <span className="food-diary-bju__num">{formatNutrientValueRu(m.value)}</span>
          </span>
        ))}
      </div>

      <ul className="food-diary-summary__macros">
        {summary.macros.map((m) => (
          <li key={m.key} className="food-diary-summary__macro">
            <div className="food-diary-summary__macro-top">
              <span className="food-diary-summary__macro-label">
                {m.label}
                <span className="muted"> · {m.sharePct}% ккал</span>
              </span>
              <span className="food-diary-summary__macro-val">
                {formatNutrientValueRu(m.value)}
                <span className="muted"> / {m.target} {m.unit}</span>
              </span>
            </div>
            <Bar pct={m.pct} tone={m.key === 'protein_g' ? 'protein' : m.key === 'fat_g' ? 'fat' : 'carb'} />
          </li>
        ))}
      </ul>

      <ul className="food-diary-summary__extras">
        {summary.extras.map((x) => (
          <li key={x.key} className="food-diary-summary__extra">
            <div className="food-diary-summary__extra-top">
              <span>
                {x.label}
                {x.hint ? <span className="muted"> · {x.hint}</span> : null}
              </span>
              <span>
                {x.key === 'sodium_mg'
                  ? formatNutrientValueRu(x.value, { integer: true })
                  : formatNutrientValueRu(x.value)}
                <span className="muted">
                  {' '}
                  / {x.target} {x.unit}
                </span>
              </span>
            </div>
            <Bar pct={x.pct} tone="extra" />
          </li>
        ))}
      </ul>
    </section>
  )
}
