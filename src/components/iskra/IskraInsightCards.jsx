import { ArrowRight, Sparkles } from 'lucide-react'

/**
 * @param {{
 *   cards: Array<object>,
 *   loading?: boolean,
 *   disabled?: boolean,
 *   onDo: (card: object) => void,
 * }} props
 */
export function IskraInsightCards({ cards, loading = false, disabled = false, onDo }) {
  if (loading) {
    return (
      <div className="iskra-insights iskra-insights--loading" aria-hidden>
        <span />
        <span />
        <span />
      </div>
    )
  }
  if (!cards?.length) return null

  return (
    <div className="iskra-insights" aria-label="Приоритеты ИСКРЫ">
      <div className="iskra-insights__head">
        <Sparkles size={14} aria-hidden />
        <span>Что важно сейчас</span>
      </div>
      <div className="iskra-insights__track">
        {cards.map((card) => (
          <article
            key={card.id}
            className={`iskra-insight-card iskra-insight-card--${card.tone || 'neutral'}`}
          >
            <h3 className="iskra-insight-card__title">{card.headline}</h3>
            {card.impactLabel ? (
              <p className="iskra-insight-card__impact">{card.impactLabel}</p>
            ) : null}
            <p className="iskra-insight-card__body">{card.action}</p>
            <p className="iskra-insight-card__evidence muted">{card.evidence}</p>
            <button
              type="button"
              className="btn btn-primary btn-sm iskra-insight-card__do"
              disabled={disabled}
              onClick={() => onDo(card)}
            >
              {card.doLabel ?? 'Сделать'}
              <ArrowRight size={14} aria-hidden />
            </button>
          </article>
        ))}
      </div>
    </div>
  )
}
