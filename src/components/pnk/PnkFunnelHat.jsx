import { Ban, ChevronLeft, ChevronRight, FastForward } from 'lucide-react'
import { PnkStepBlocks } from './PnkStepBlocks.jsx'

/**
 * Единая шапка воронки ПНК: прогресс + Назад / Далее / Пропустить [/ Отказ].
 * Действия — один ряд (симметрия), когда влезают.
 * @param {{
 *   step: { n: number, total: number, title: string, help?: string, key?: string },
 *   nav: {
 *     canBack: boolean,
 *     backReason?: string | null,
 *     backTitle?: string | null,
 *     canNext: boolean,
 *     nextReason?: string | null,
 *     nextLabel?: string,
 *     canSkip: boolean,
 *     skipReason?: string | null,
 *   },
 *   busy?: boolean,
 *   onBack?: () => void,
 *   onNext?: () => void,
 *   onSkip?: () => void,
 *   onRefuse?: () => void,
 *   showRefuse?: boolean,
 *   hideNav?: boolean,
 * }} props
 */
export function PnkFunnelHat({
  step,
  nav,
  busy = false,
  onBack,
  onNext,
  onSkip,
  onRefuse,
  showRefuse = false,
  hideNav = false,
}) {
  if (!step) return null
  return (
    <div className="pnk-funnel-hat" aria-label={`Воронка ПНК, шаг ${step.n} из ${step.total}`}>
      <div className="pnk-funnel-hat__top">
        <div className="pnk-funnel-hat__titles">
          <p className="pnk-client-panel__step-kicker">ПНК · шаг {step.n}/{step.total}</p>
          <h2 className="pnk-funnel-hat__title">{step.title}</h2>
        </div>
        <span className="pnk-control-tile__step-badge" aria-hidden>
          {step.n}/{step.total}
        </span>
      </div>

      <PnkStepBlocks stepN={step.n} stepTotal={step.total} className="pnk-funnel-hat__blocks" />

      {step.help ? <p className="pnk-funnel-hat__help">{step.help}</p> : null}

      {!hideNav ? (
        <div className="pnk-funnel-hat__nav" role="group" aria-label="Навигация по воронке">
          <button
            type="button"
            className="btn btn-ghost btn-touch pnk-funnel-hat__btn"
            disabled={busy || !nav?.canBack}
            title={
              nav?.canBack
                ? `Назад: ${nav.backTitle || 'предыдущий шаг'}`
                : nav?.backReason || 'Назад'
            }
            onClick={() => onBack?.()}
          >
            <ChevronLeft size={18} aria-hidden /> Назад
          </button>
          <button
            type="button"
            className="btn btn-primary btn-touch pnk-funnel-hat__btn pnk-funnel-hat__btn--next"
            disabled={busy || !nav?.canNext}
            title={nav?.canNext ? nav.nextLabel || 'Далее' : nav?.nextReason || 'Далее'}
            onClick={() => onNext?.()}
          >
            {nav?.nextLabel || 'Далее'} <ChevronRight size={18} aria-hidden />
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-touch pnk-funnel-hat__btn"
            disabled={busy || !nav?.canSkip}
            title={nav?.canSkip ? 'Пропустить шаг' : nav?.skipReason || 'Пропустить'}
            onClick={() => onSkip?.()}
          >
            <FastForward size={16} aria-hidden /> Пропустить
          </button>
          {showRefuse ? (
            <button
              type="button"
              className="btn btn-ghost btn-touch pnk-funnel-hat__btn pnk-funnel-hat__btn--refuse"
              disabled={busy}
              title="Отказ клиента — выйти из воронки без оформления ДК"
              onClick={() => onRefuse?.()}
            >
              <Ban size={16} aria-hidden /> Отказ
            </button>
          ) : null}
        </div>
      ) : null}

      {!hideNav && !nav?.canNext && nav?.nextReason ? (
        <p className="pnk-funnel-hat__hint muted">{nav.nextReason}</p>
      ) : null}
    </div>
  )
}
