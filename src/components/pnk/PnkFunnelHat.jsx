import { Ban, Check, ChevronLeft, ChevronRight, FastForward, UserCheck } from 'lucide-react'
import { PnkStepBlocks } from './PnkStepBlocks.jsx'

/**
 * Единая шапка воронки ПНК: прогресс + иконки Назад / CTA / Пропустить / Отказ.
 * primarySlot=hat → главная CTA яркая; body → главная кнопка в теле шага.
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
  const primaryInHat = (nav?.primarySlot || 'hat') === 'hat'
  const nextLabel = nav?.nextLabel || 'Далее'
  const nextClass = primaryInHat
    ? 'btn btn-primary btn-touch btn-icon-square pnk-funnel-hat__btn pnk-funnel-hat__btn--cta'
    : 'btn btn-secondary btn-touch btn-icon-square pnk-funnel-hat__btn pnk-funnel-hat__btn--next-soft'

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
        <div
          className={`pnk-funnel-hat__nav${primaryInHat ? ' pnk-funnel-hat__nav--cta-hat' : ' pnk-funnel-hat__nav--cta-body'}`}
          role="group"
          aria-label="Навигация по воронке"
        >
          <button
            type="button"
            className="btn btn-ghost btn-touch btn-icon-square pnk-funnel-hat__btn pnk-funnel-hat__btn--side"
            disabled={busy || !nav?.canBack}
            aria-label="Назад"
            title={
              nav?.canBack
                ? `Назад: ${nav.backTitle || 'предыдущий шаг'}`
                : nav?.backReason || 'Назад'
            }
            onClick={() => onBack?.()}
          >
            <ChevronLeft size={20} aria-hidden />
          </button>
          <button
            type="button"
            className={nextClass}
            disabled={busy || !nav?.canNext}
            aria-label={nextLabel}
            title={nav?.canNext ? nextLabel : nav?.nextReason || nextLabel}
            onClick={() => onNext?.()}
          >
            <HatNextIcon label={nextLabel} />
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-touch btn-icon-square pnk-funnel-hat__btn pnk-funnel-hat__btn--side"
            disabled={busy || !nav?.canSkip}
            aria-label="Пропустить"
            title={nav?.canSkip ? 'Пропустить шаг' : nav?.skipReason || 'Пропустить'}
            onClick={() => onSkip?.()}
          >
            <FastForward size={18} aria-hidden />
          </button>
          {showRefuse ? (
            <button
              type="button"
              className="btn btn-ghost btn-touch btn-icon-square pnk-funnel-hat__btn pnk-funnel-hat__btn--side pnk-funnel-hat__btn--refuse"
              disabled={busy}
              aria-label="Отказ"
              title="Отказ — удалить карточку; в статистике останется отметка без оформления"
              onClick={() => onRefuse?.()}
            >
              <Ban size={18} aria-hidden />
            </button>
          ) : null}
        </div>
      ) : null}

      {!hideNav && !nav?.canNext && nav?.nextReason ? (
        <p className="pnk-funnel-hat__hint muted">{nav.nextReason}</p>
      ) : null}
      {!hideNav && !primaryInHat && !nav?.canNext ? (
        <p className="pnk-funnel-hat__hint muted">Главное действие — большая кнопка ниже</p>
      ) : null}
    </div>
  )
}

function HatNextIcon({ label }) {
  const t = String(label || '')
  if (/приш[её]л|начал/i.test(t)) return <UserCheck size={20} aria-hidden />
  if (/сохран/i.test(t)) return <Check size={20} aria-hidden />
  return <ChevronRight size={20} aria-hidden />
}
