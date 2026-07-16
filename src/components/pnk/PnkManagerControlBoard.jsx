import { useEffect, useRef, useState } from 'react'
import { UserPlus } from 'lucide-react'
import { PnkStepBlocks } from './PnkStepBlocks.jsx'
import { PnkBoardFilterChips } from './PnkStatusChips'
import { PnkControlCardDetail } from './PnkControlCardDetail.jsx'
import { buildPnkManagerControlCards } from '../../lib/pnk/pnkManagerBoardCore.js'

/**
 * Доска контроля ПНК: квадратная сетка + панель оценки (layout split).
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
  workExtras = null,
  assessExtras = null,
}) {
  const [trainerId, setTrainerId] = useState('')
  const [query, setQuery] = useState('')
  const [expandedId, setExpandedId] = useState(() => String(initialFocusId || '').trim())
  const [confirmDelete, setConfirmDelete] = useState(null)
  const focusAppliedRef = useRef(false)
  const lastFocusParamRef = useRef(String(initialFocusId || '').trim())

  const cards = buildPnkManagerControlCards(clients, {
    boardFilter,
    attentionIds,
    trainerId,
    query,
  })
  const cardIdsKey = cards.map((c) => c.id).join(',')

  useEffect(() => {
    const focus = String(initialFocusId || '').trim()
    if (focus !== lastFocusParamRef.current) {
      lastFocusParamRef.current = focus
      focusAppliedRef.current = false
    }
    setExpandedId((prev) => {
      if (!focusAppliedRef.current && focus && cards.some((c) => c.id === focus)) {
        focusAppliedRef.current = true
        return focus
      }
      if (prev && cards.some((c) => c.id === prev)) return prev
      return cards[0]?.id ?? ''
    })
  }, [cardIdsKey, initialFocusId])

  const selected = cards.find((c) => c.id === expandedId) ?? null
  const canDelete = typeof onDelete === 'function'

  return (
    <section className="pnk-control-board pnk-control-board--split" aria-label="Контроль ПНК">
      <div className="pnk-control-board__master">
        {workExtras}
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
          <ul className="pnk-control-board__grid" role="list">
            {cards.map((card) => {
              const open = expandedId === card.id
              return (
                <li
                  key={card.id}
                  className={`pnk-control-tile trainer-task-glance__card${card.isHot ? ' trainer-task-glance__card--hot' : ''}${open ? ' pnk-control-tile--selected' : ''}`}
                >
                  <button
                    type="button"
                    className="pnk-control-tile__btn"
                    onClick={() => setExpandedId(card.id)}
                    aria-pressed={open}
                    aria-label={`${card.name}, шаг ${card.stepN} из ${card.stepTotal}`}
                  >
                    <span className="trainer-task-glance__icon trainer-pnk-glance__icon pnk-control-tile__icon" aria-hidden>
                      <UserPlus size={18} />
                    </span>
                    <strong className="pnk-control-tile__name">{card.name}</strong>
                    {card.isHot ? (
                      <span className="pnk-control-card__hot pnk-control-tile__hot">{card.hotLabel || 'Внимание'}</span>
                    ) : null}
                    <span className="pnk-control-tile__meta muted">{card.trainerName}</span>
                    <span className="pnk-control-tile__step muted">
                      {card.stepN}/{card.stepTotal}
                    </span>
                    <PnkStepBlocks stepN={card.stepN} stepTotal={card.stepTotal} />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="pnk-control-board__assess">
        <PnkControlCardDetail
          card={selected}
          busy={busy}
          managerName={managerName}
          clientHref={clientHref}
          onNotifyResult={onNotifyResult}
          onComment={onComment}
          onRequestDelete={canDelete ? setConfirmDelete : undefined}
        />
        {assessExtras}
      </div>

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
