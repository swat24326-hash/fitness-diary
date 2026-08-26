import { Link } from 'react-router-dom'
import { Ticket } from 'lucide-react'
import { saleClipAwaitingHours } from '../../lib/admin/saleClipLocalService.js'
import { formatDateRu } from '../../lib/dateRu.js'
import { useAuth } from '../../context/AuthContext'
import { useAwaitingSaleClips } from '../../hooks/useAwaitingSaleClips.js'
import { SalesVisualAlert } from '../sales/SalesVisualAlert.jsx'

/**
 * Панель «создать по клипу» на карточке клиента (полная). На главной — TrainerHomeTodayStrip.
 */
export function TrainerSaleClipsPanel({ clientId, clubId, mode = 'client', onCreated }) {
  const { user } = useAuth()
  const { clips, busyId, error, info, createFrom } = useAwaitingSaleClips({
    mode,
    clientId,
    clubId,
    userId: user?.id,
    onCreated,
  })

  if (!clips.length) {
    if (mode !== 'trainer') return null
    return (
      <section className="trainer-sale-clips trainer-sale-clips--empty" aria-label="Заявки на абонемент">
        <h3 className="trainer-sale-clips__title">
          <Ticket size={18} aria-hidden /> Заявки на абон
        </h3>
        <p className="muted">
          Сейчас заявок нет. Если менеджер только что отправил — нажмите Sync в шапке.
        </p>
      </section>
    )
  }

  return (
    <section className="trainer-sale-clips" aria-label="Заявки на абонемент">
      <h3 className="trainer-sale-clips__title">
        <Ticket size={18} aria-hidden /> Заявки: создать абонемент
      </h3>
      <p className="muted">
        Одна кнопка — поля из заявки менеджера. Обычная форма абона заявку <strong>не</strong> закрывает.
      </p>
      {error ? (
        <SalesVisualAlert level="error" title="Программа не создала абонемент">
          <p>{error}</p>
        </SalesVisualAlert>
      ) : null}
      {info ? (
        <SalesVisualAlert level="ok" title="Готово">
          <p>{info}</p>
        </SalesVisualAlert>
      ) : null}
      <ul className="trainer-sale-clips__list">
        {clips.map((c) => {
          const hours = saleClipAwaitingHours(c)
          const href = c.client_id ? `/trainer/clients/${c.client_id}?tab=memberships` : null
          return (
            <li key={c.id}>
              <div>
                <strong>{c.client_name}</strong>
                {c.card_number ? ` · №${c.card_number}` : ''}
                {c.membership_type_label ? ` · ${c.membership_type_label}` : ''}
                {c.total_trainings != null ? ` · ${c.total_trainings} тр.` : ''}
                <div className="muted">
                  {c.clip_date ? `${formatDateRu(c.clip_date)} · ` : ''}
                  Ждём вас{hours ? ` · уже ${hours} ч` : ''}
                  {!(clientId || c.client_id) ? ' · нет карточки в базе — кнопку нельзя' : ''}
                  {href && mode === 'trainer' ? (
                    <>
                      {' · '}
                      <Link to={href}>открыть карточку</Link>
                    </>
                  ) : null}
                </div>
              </div>
              <button
                type="button"
                className="btn btn-primary btn-touch"
                disabled={Boolean(busyId) || !(clientId || c.client_id)}
                onClick={() => void createFrom(c)}
              >
                {busyId === String(c.id) ? '…' : 'Создать по заявке'}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
