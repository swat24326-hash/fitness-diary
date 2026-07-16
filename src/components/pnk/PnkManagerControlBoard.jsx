import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ChevronUp, UserPlus } from 'lucide-react'
import { DispatchTaskProgressMini } from '../iskra/DispatchTaskProgressMini.jsx'
import { PnkCoachNotifyChip } from './PnkCoachNotifyChip'
import { PnkAttentionChips, PnkBoardFilterChips } from './PnkStatusChips'
import { buildPnkManagerControlCards } from '../../lib/pnk/pnkManagerBoardCore.js'
import { buildPnkAttentionFlags } from '../../lib/pnk/pnkStagesCore.js'

/**
 * Прокручиваемая доска контроля ПНК (менеджер / админ).
 * Стиль как glance заданий, но список — десятки карточек + вмешательство.
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
}) {
  const [trainerId, setTrainerId] = useState('')
  const [query, setQuery] = useState('')
  const [expandedId, setExpandedId] = useState('')

  const cards = buildPnkManagerControlCards(clients, {
    boardFilter,
    attentionIds,
    trainerId,
    query,
  })

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
                    <DispatchTaskProgressMini progress={card.progressMini} />
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
