import { Link } from 'react-router-dom'
import { saleClipListStatusText } from '../../lib/admin/saleClipCore.js'
import { formatDateRu } from '../../lib/dateRu.js'

/**
 * Список заявок выбранного дня.
 * @param {{
 *   clips: object[],
 *   day: string,
 *   trainerNameById: Map<string, string>,
 *   clubId: string,
 *   canOpenAdminClient?: boolean,
 *   busy?: boolean,
 *   onCancel: (id: string) => void,
 *   onCreate: (clip: object) => void,
 * }} props
 */
export function SalesClipDayList({
  clips,
  day,
  trainerNameById,
  clubId,
  canOpenAdminClient = false,
  busy = false,
  onCancel,
  onCreate,
}) {
  return (
    <>
      <h3 className="sales-clip-section__list-title">Заявки на {formatDateRu(day)}</h3>
      {!clips.length ? (
        <p className="sales-clip-section__empty">Пока пусто — создайте после продажи (НК, ДК или УК).</p>
      ) : (
        <ul className="sales-clip-list">
          {clips.map((c) => {
            const awaiting = c.status === 'awaiting'
            return (
              <li key={c.id}>
                <div>
                  <strong>{c.client_name}</strong>
                  {c.card_number ? ` · карта ${c.card_number}` : ''}
                  {c.phone ? ` · ${c.phone}` : ''}
                  <div className="muted">
                    {saleClipListStatusText(c.status)}
                    {c.trainer_id ? ` · ${trainerNameById.get(String(c.trainer_id)) || 'тренер'}` : ''}
                    {canOpenAdminClient && c.client_id ? (
                      <>
                        {' · '}
                        <Link to={`/admin/clients/${c.client_id}?club=${encodeURIComponent(clubId)}&from=clips`}>
                          карточка
                        </Link>
                      </>
                    ) : null}
                  </div>
                </div>
                {awaiting ? (
                  <div className="sales-clip-list__actions">
                    <button type="button" className="btn btn-primary btn-xs" disabled={busy} onClick={() => onCreate(c)}>
                      Создать абонемент
                    </button>
                    <button type="button" className="btn btn-xs" disabled={busy} onClick={() => onCancel(c.id)}>
                      Отменить
                    </button>
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
