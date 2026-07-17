import { UserPlus } from 'lucide-react'
import { PnkStepBlocks } from './PnkStepBlocks.jsx'

/**
 * Лицо карточки ПНК на главной (менеджер / тренер) —
 * те же принципы, что плитки на доске админа: ФИО, шаг, алерт, шкала.
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
  const alertText = hotLabel || (isHot ? caption : '') || null

  return (
    <button
      type="button"
      className="pnk-glance-face"
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
        <span className="pnk-control-tile__step-badge">{stepN}/{stepTotal}</span>
      </div>

      <strong className="pnk-glance-face__name">{name}</strong>
      {stepTitle ? <span className="pnk-glance-face__stage">{stepTitle}</span> : null}

      {alertText ? (
        <span className="pnk-control-tile__alert">{alertText}</span>
      ) : caption ? (
        <span className="pnk-glance-face__caption muted">{caption}</span>
      ) : null}

      <div className="pnk-funnel-hat--tile">
        <p className="pnk-client-panel__step-kicker">
          ПНК · шаг {stepN}/{stepTotal}
        </p>
        <PnkStepBlocks stepN={stepN} stepTotal={stepTotal} />
      </div>
      <span className="pnk-glance-face__cta muted">Открыть</span>
    </button>
  )
}
