/**
 * Диалог перед attach ПНК к существующей карточке (карта/телефон совпали).
 */
import { useState } from 'react'

/**
 * @param {{
 *   matched: {
 *     name?: string,
 *     card_number?: string,
 *     phone?: string,
 *     membershipFact?: string,
 *     nameDiffers?: boolean,
 *     proposedName?: string,
 *   },
 *   matchedBy?: string|null,
 *   busy?: boolean,
 *   onAttach: (opts: { overwriteName: boolean }) => void,
 *   onCreateWithoutCard: () => void,
 *   onCancel: () => void,
 * }} props
 */
export function PnkAttachConfirmDialog({
  matched,
  matchedBy,
  busy = false,
  onAttach,
  onCreateWithoutCard,
  onCancel,
}) {
  const [overwriteName, setOverwriteName] = useState(false)
  const name = String(matched?.name ?? '').trim() || 'Клиент'
  const card = String(matched?.card_number ?? '').trim()
  const phone = String(matched?.phone ?? '').trim()
  const mem = String(matched?.membershipFact ?? '').trim()
  const by =
    matchedBy === 'card' ? 'по № карты' : matchedBy === 'phone' ? 'по телефону' : 'по карте или телефону'
  const proposed = String(matched?.proposedName ?? '').trim()
  const nameDiffers = Boolean(matched?.nameDiffers)

  return (
    <div className="modal-backdrop" role="presentation" onClick={busy ? undefined : onCancel}>
      <div
        className="modal card pnk-attach-confirm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pnk-attach-confirm-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="pnk-attach-confirm-title" className="pnk-funnel__section-title">
          Клиент уже в клубе
        </h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Совпадение {by}. Это не новая карточка — ПНК привяжется к найденной. Чужой № карты не
          вводите: абонемент останется у этой карточки.
        </p>
        <ul className="pnk-attach-confirm__facts" style={{ margin: '12px 0', paddingLeft: 18 }}>
          <li>
            <strong>{name}</strong>
          </li>
          {card ? <li>Карта №{card}</li> : null}
          {phone ? <li>Телефон {phone}</li> : null}
          {mem ? <li>Абонемент: {mem}</li> : <li>Абонемент: нет данных</li>}
        </ul>
        {nameDiffers && proposed ? (
          <label className="label" style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 12 }}>
            <input
              type="checkbox"
              checked={overwriteName}
              disabled={busy}
              onChange={(e) => setOverwriteName(e.target.checked)}
            />
            <span>
              Заменить ФИО на «{proposed}» (сейчас «{name}»). Без галочки имя в карточке не меняется.
            </span>
          </label>
        ) : null}
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-ghost btn-touch" disabled={busy} onClick={onCancel}>
            Отмена
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-touch"
            disabled={busy}
            onClick={onCreateWithoutCard}
            title="Создать нового ПНК без номера карты"
          >
            Создать без карты
          </button>
          <button
            type="button"
            className="btn btn-primary btn-touch"
            disabled={busy}
            onClick={() => onAttach({ overwriteName: nameDiffers ? overwriteName : false })}
          >
            {busy ? 'Привязываем…' : 'Привязать ПНК'}
          </button>
        </div>
      </div>
    </div>
  )
}
