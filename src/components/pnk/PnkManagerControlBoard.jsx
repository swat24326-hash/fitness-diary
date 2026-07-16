import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ChevronUp, Trash2, UserPlus } from 'lucide-react'
import { PnkStepBlocks } from './PnkStepBlocks.jsx'
import { PnkCoachNotifyChip } from './PnkCoachNotifyChip'
import { PnkAttentionChips, PnkBoardFilterChips } from './PnkStatusChips'
import { buildPnkManagerControlCards } from '../../lib/pnk/pnkManagerBoardCore.js'
import { buildPnkAttentionFlags, canDeletePnkClient } from '../../lib/pnk/pnkStagesCore.js'

/**
 * Прокручиваемая доска контроля ПНК (менеджер / админ).
 */
export function PnkManagerControlBoard({
  clients = [],
  attentionIds,
  boardFilter = 'all',
  onBoardFilterChange,
  filterCounts,
  trainers = [],
  managerName = '',
  busy = false,
  clientHref,
  onNotifyResult,
  onComment,
  onDelete,
  initialFocusId = '',
}) {
  const [trainerId, setTrainerId] = useState('')
  const [query, setQuery] = useState('')
  const [expandedId, setExpandedId] = useState(() => String(initialFocusId || '').trim())
  const [confirmDelete, setConfirmDelete] = useState(null)

  const cards = buildPnkManagerControlCards(clients, {
    boardFilter,
    attentionIds,
    trainerId,
    query,
  })

  const canDelete = typeof onDelete === 'function'

  return (
    <section className="pnk-control-board" aria-label="Контроль ПНК">
      <div className="pnk-control-board__toolbar">
        <h2 className="pnk-funnel__section-title" style={{ margin: 0 }}>
          В работе ({cards.length}
          {clients.length !== cards.length ? ` из ${clients.length}` : ''})
        </h2>
        <PnkBoardFilterChips value={boardFilter} onChange={onBoardFilterChange} counts={filterCounts} />
        <div className="pnk-control-board__filters">
          <input
            className="input"
            type="search"
            placeholder="Поиск: имя, телефон, тренер"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Поиск ПНК"
          />
          <select
            className="input"
            value={trainerId}
            onChange={(e) => setTrainerId(e.target.value)}
            aria-label="Фильтр по тренеру"
          >
            <option value="">Все тренеры</option>
            {trainers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!cards.length ? (
        <p className="muted">Пока нет открытых ПНК по фильтру</p>
      ) : (
        <ul className="pnk-control-board__scroll" role="list">
          {cards.map((card) => {
            const open = expandedId === card.id
            const flags = buildPnkAttentionFlags(card.client)
            const href = typeof clientHref === 'function' ? clientHref(card.client) : null
            const showDelete = canDelete && canDeletePnkClient(card.client)
            return (
              <li
                key={card.id}
                className={`pnk-control-card trainer-task-glance__card${card.isHot ? ' trainer-task-glance__card--hot' : ''}${open ? ' pnk-control-card--open' : ''}`}
              >
                <button
                  type="button"
                  className="pnk-control-card__summary"
                  onClick={() => setExpandedId(open ? '' : card.id)}
                  aria-expanded={open}
                >
                  <span className="trainer-task-glance__icon trainer-pnk-glance__icon" aria-hidden>
                    <UserPlus size={18} />
                  </span>
                  <span className="pnk-control-card__main">
                    <span className="pnk-control-card__title-row">
                      <strong className="pnk-control-card__name">{card.name}</strong>
                      {card.isHot ? (
                        <span className="pnk-control-card__hot">{card.hotLabel || 'Внимание'}</span>
                      ) : null}
                    </span>
                    <span className="pnk-control-card__meta muted">
                      {card.trainerName}
                      {card.caption ? ` · ${card.caption}` : ''}
                    </span>
                    <span className="pnk-control-card__step muted">
                      Шаг {card.stepN}/{card.stepTotal} · {card.stepTitle}
                    </span>
                    <PnkStepBlocks stepN={card.stepN} stepTotal={card.stepTotal} />
                  </span>
                  <span className="pnk-control-card__chevron" aria-hidden>
                    {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </span>
                </button>

                {open ? (
                  <div className="pnk-control-card__panel">
                    {flags.length ? <PnkAttentionChips flags={flags} /> : null}
                    <p className="pnk-control-card__intervene muted">
                      Вмешаться: напишите тренеру — текст под текущий этап.
                    </p>
                    <PnkCoachNotifyChip
                      client={card.client}
                      trainerName={card.trainerName}
                      trainerPhone={card.trainerPhone}
                      managerName={managerName}
                      busy={busy}
                      onResult={onNotifyResult}
                    />
                    {href ? (
                      <Link to={href} className="btn btn-secondary btn-touch u-no-decoration">
                        Открыть карточку клиента
                      </Link>
                    ) : null}
                    {typeof onComment === 'function' ? (
                      <CommentMini disabled={busy} onSubmit={(text) => onComment(card.id, text)} />
                    ) : null}
                    {showDelete ? (
                      <button
                        type="button"
                        className="btn btn-ghost btn-touch pnk-control-card__delete"
                        disabled={busy}
                        onClick={() => setConfirmDelete({ id: card.id, name: card.name })}
                      >
                        <Trash2 size={16} aria-hidden />
                        Удалить ПНК
                      </button>
                    ) : null}
                    {card.client?.pnk_comment ? (
                      <p className="pnk-funnel__comment">«{card.client.pnk_comment}»</p>
                    ) : null}
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}

      {confirmDelete ? (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pnk-delete-title"
          onClick={() => !busy && setConfirmDelete(null)}
        >
          <div className="modal-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <h2 id="pnk-delete-title" className="section-title" style={{ marginTop: 0 }}>
              Удалить ПНК?
            </h2>
            <p className="muted" style={{ marginTop: 8 }}>
              Карточка <strong style={{ color: 'var(--text)' }}>{confirmDelete.name}</strong> будет удалена без
              восстановления. Связанные тренировки и абонементы этой карточки тоже уйдут.
            </p>
            <div className="row td-modal-actions" style={{ marginTop: 18 }}>
              <button type="button" className="btn btn-ghost btn-touch" disabled={busy} onClick={() => setConfirmDelete(null)}>
                Отмена
              </button>
              <button
                type="button"
                className="btn btn-touch pnk-control-card__delete-confirm"
                disabled={busy}
                onClick={() => {
                  const id = confirmDelete.id
                  setConfirmDelete(null)
                  void onDelete?.(id)
                }}
              >
                {busy ? 'Удаление…' : 'Да, удалить'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
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
