import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Trash2 } from 'lucide-react'
import { PnkStepBlocks } from './PnkStepBlocks.jsx'
import { PnkCoachNotifyChip } from './PnkCoachNotifyChip'
import { PnkAttentionChips } from './PnkStatusChips'
import { PnkVisitQualityReport } from './PnkVisitQualityReport.jsx'
import { buildPnkAttentionFlags, canDeletePnkClient } from '../../lib/pnk/pnkStagesCore.js'
import { buildPnkVisitQualityReport } from '../../lib/pnk/pnkVisitQualityCore.js'

/**
 * Правая панель оценки выбранного ПНК (master–detail).
 */
export function PnkControlCardDetail({
  card = null,
  busy = false,
  managerName = '',
  clientHref,
  onNotifyResult,
  onComment,
  onRequestDelete,
  showVisitQuality = false,
  visitQualityReport = null,
}) {
  if (!card) {
    return (
      <div className="pnk-control-detail pnk-control-detail--empty card" aria-live="polite">
        <p className="pnk-funnel__section-title" style={{ margin: 0 }}>
          Оценка ПНК
        </p>
        <p className="muted" style={{ margin: '8px 0 0' }}>
          Выберите карточку слева — здесь шаги, связь с тренером и комментарий.
        </p>
      </div>
    )
  }

  const flags = buildPnkAttentionFlags(card.client)
  const href = typeof clientHref === 'function' ? clientHref(card.client) : null
  const showDelete = typeof onRequestDelete === 'function' && canDeletePnkClient(card.client)

  return (
    <div className="pnk-control-detail card" aria-label={`Оценка: ${card.name}`}>
      <div className="pnk-control-detail__head">
        <div className="pnk-control-detail__titles">
          <h3 className="pnk-control-detail__name">{card.name}</h3>
          {card.isHot ? (
            <span className="pnk-control-card__hot">{card.hotLabel || 'Внимание'}</span>
          ) : null}
        </div>
        <p className="pnk-control-card__meta muted" style={{ margin: 0 }}>
          {card.trainerName}
          {card.caption ? ` · ${card.caption}` : ''}
        </p>
        <p className="pnk-control-card__step muted" style={{ margin: 0 }}>
          ПНК · шаг {card.stepN}/{card.stepTotal} · {card.stepTitle}
        </p>
        <div className="pnk-funnel-hat--tile">
          <PnkStepBlocks stepN={card.stepN} stepTotal={card.stepTotal} />
        </div>
      </div>

      {flags.length ? <PnkAttentionChips flags={flags} /> : null}

      {showVisitQuality ? (
        <PnkVisitQualityReport
          report={visitQualityReport || buildPnkVisitQualityReport(card.client)}
          className="pnk-visit-quality--compact"
        />
      ) : null}

      <p className="pnk-control-card__intervene muted">
        Вмешаться: напишите тренеру — текст под текущий этап.
      </p>
      <div className="pnk-control-detail__actions" role="group" aria-label="Действия по ПНК">
        <PnkCoachNotifyChip
          client={card.client}
          trainerName={card.trainerName}
          trainerPhone={card.trainerPhone}
          managerName={managerName}
          busy={busy}
          onResult={onNotifyResult}
        />
        {href ? (
          <Link to={href} className="btn btn-secondary btn-touch u-no-decoration pnk-control-detail__action">
            Открыть карточку клиента
          </Link>
        ) : null}
        {showDelete ? (
          <button
            type="button"
            className="btn btn-ghost btn-touch pnk-control-card__delete pnk-control-detail__action"
            disabled={busy}
            onClick={() => onRequestDelete({ id: card.id, name: card.name })}
            title="Удалить ПНК"
          >
            <Trash2 size={16} aria-hidden />
            Удалить ПНК
          </button>
        ) : null}
      </div>
      {typeof onComment === 'function' ? (
        <CommentMini disabled={busy} onSubmit={(text) => onComment(card.id, text)} />
      ) : null}
      {card.client?.pnk_comment ? (
        <p className="pnk-funnel__comment">«{card.client.pnk_comment}»</p>
      ) : null}
    </div>
  )
}

function CommentMini({ onSubmit, disabled }) {
  const [text, setText] = useState('')
  return (
    <form
      className="pnk-funnel__comment-form"
      onSubmit={(e) => {
        e.preventDefault()
        const v = text.trim()
        if (!v) return
        onSubmit(v)
        setText('')
      }}
    >
      <input
        className="input"
        placeholder="Комментарий в воронку"
        value={text}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        aria-label="Комментарий"
      />
      <button type="submit" className="btn btn-secondary btn-sm btn-touch" disabled={disabled || !text.trim()}>
        OK
      </button>
    </form>
  )
}
