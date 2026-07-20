import { UserPlus } from 'lucide-react'
import { PnkStepBlocks } from './PnkStepBlocks.jsx'

/**
 * Лицо карточки ПНК на главной (менеджер / тренер) —
 * шапка · имя · этап · статус · шкала — по ширине, без кучи в углу.
 */
export function PnkGlanceCardFace({
  name = '',
  stepN = 1,
  stepTotal = 5,
  stepTitle = '',
  caption = '',
  isHot = false,
  hotLabel = null,
  metaLine = '',
  eyebrow = 'ПНК в работе',
  titleId = 'pnk-glance-title',
  onClick,
  ariaLabel = '',
}) {
  const statusText = hotLabel || caption || null

  return (
    <button
      type="button"
      className={`pnk-glance-face${isHot ? ' pnk-glance-face--hot' : ''}`}
      onClick={onClick}
      aria-label={ariaLabel || `Открыть ПНК: ${name}`}
    >
      <div className="pnk-glance-face__top">
        <span className="trainer-task-glance__icon trainer-pnk-glance__icon pnk-glance-face__icon" aria-hidden>
          <UserPlus size={18} />
        </span>
        <div className="pnk-glance-face__head-text">
          <h2 id={titleId} className="pnk-glance-face__eyebrow">
            {eyebrow}
          </h2>
          {metaLine ? <p className="pnk-glance-face__meta muted">{metaLine}</p> : null}
        </div>
        <span className="pnk-glance-face__step-badge" aria-label={`Шаг ${stepN} из ${stepTotal}`}>
          {stepN}/{stepTotal}
        </span>
      </div>

      <div className="pnk-glance-face__main">
        <strong className="pnk-glance-face__name">{name}</strong>
        {stepTitle ? <span className="pnk-glance-face__stage">{stepTitle}</span> : null}
        {statusText ? (
          <span className={`pnk-glance-face__status${isHot || hotLabel ? ' pnk-glance-face__status--hot' : ''}`}>
            {statusText}
          </span>
        ) : null}
      </div>

      <div className="pnk-glance-face__progress">
        <p className="pnk-glance-face__step-kicker">
          ПНК · шаг {stepN}/{stepTotal}
        </p>
        <PnkStepBlocks stepN={stepN} stepTotal={stepTotal} />
      </div>

      <span className="pnk-glance-face__cta muted">Открыть</span>
    </button>
  )
}
