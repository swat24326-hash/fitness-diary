import { Link } from 'react-router-dom'
import { AlertTriangle, Cake, CalendarClock, Clock, Gauge, Ticket, UserPlus, UserX } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useAwaitingSaleClips } from '../../hooks/useAwaitingSaleClips.js'
import {
  buildTrainerAttentionItems,
  groupTrainerAttentionItems,
} from '../../lib/trainer/trainerAttentionUiCore.js'
import { saleClipAwaitingHours } from '../../lib/admin/saleClipLocalService.js'
import { formatDateRu } from '../../lib/dateRu.js'
import { SalesVisualAlert } from '../sales/SalesVisualAlert.jsx'

const ICONS = {
  pnk: UserPlus,
  birthdays: Cake,
  expiring: Clock,
  expired_recent: AlertTriangle,
  stale: CalendarClock,
  inactive: UserX,
}

function AttentionTile({ card }) {
  const Icon = ICONS[card.key] || Clock
  return (
    <li>
      <Link to={card.to} className="trainer-today-tile u-no-decoration">
        <span className="trainer-today-tile__icon" aria-hidden>
          <Icon size={18} />
        </span>
        <span className="trainer-today-tile__count">{card.count}</span>
        <span className="trainer-today-tile__label">{card.label}</span>
        <span className="trainer-today-tile__hint muted">{card.hint}</span>
      </Link>
    </li>
  )
}

/**
 * Главная тренера — как на скрине планшета:
 * Сегодня внимание → Зал → База и поводы → По абонементу (столбиком).
 * Качество всегда в ряду «Зал», чтобы сетка не прыгала.
 */
export function TrainerHomeTodayStrip({
  clubId = '',
  summary = null,
  attentionLoading = false,
  cqGlance = null,
  cqLoading = false,
}) {
  const { user } = useAuth()
  const { clips, busyId, error, info, createFrom } = useAwaitingSaleClips({
    mode: 'trainer',
    clubId,
    userId: user?.id,
  })

  const groups = summary ? groupTrainerAttentionItems(buildTrainerAttentionItems(summary)) : []
  const baseGroup = groups.find((g) => g.id === 'base')
  const pathGroup = groups.find((g) => g.id === 'path')
  const clipCount = clips.length
  const cqCount = (Number(cqGlance?.thin) || 0) + (Number(cqGlance?.stuck) || 0)
  const cqHeadline = cqGlance?.hasSignal ? cqGlance.headline : 'Качество ведения — в профиле'
  const cqBusy = cqLoading && !cqGlance

  return (
    <section className="trainer-today-strip" aria-labelledby="trainer-today-strip-title">
      <div className="trainer-today-strip__head">
        <h2 id="trainer-today-strip-title" className="trainer-today-strip__title">
          Сегодня внимание
        </h2>
        {attentionLoading ? (
          <p className="trainer-today-strip__hint muted" role="status">
            Загрузка…
          </p>
        ) : summary?.actionable === 0 && clipCount === 0 && cqCount === 0 ? (
          <p className="trainer-today-strip__hint muted">Всё спокойно</p>
        ) : summary?.actionable > 0 ? (
          <p className="trainer-today-strip__hint muted">
            {summary.actionable}{' '}
            {summary.actionable === 1 ? 'повод' : summary.actionable < 5 ? 'повода' : 'поводов'}
          </p>
        ) : null}
      </div>

      <div className="trainer-today-strip__rail">
        <div className="trainer-today-strip__block trainer-today-strip__block--ops">
          <h3 className="trainer-today-strip__block-title">Зал</h3>
          <div className="trainer-today-strip__cluster trainer-today-strip__cluster--ops" aria-label="Зал">
            <div
              className={`trainer-today-tile trainer-today-tile--clips${clipCount > 0 ? '' : ' trainer-today-tile--quiet'}`}
              role="status"
              title={
                clipCount > 0
                  ? 'Ниже — создать абонемент по заявке'
                  : 'Заявок нет. Если менеджер только что отправил — Sync в шапке'
              }
            >
              <span className="trainer-today-tile__icon" aria-hidden>
                <Ticket size={18} />
              </span>
              <span className="trainer-today-tile__count">{clipCount}</span>
              <span className="trainer-today-tile__label">Заявки</span>
              <span className="trainer-today-tile__hint muted">на абон</span>
            </div>

            {cqBusy ? (
              <div className="trainer-today-tile trainer-today-tile--cq" aria-busy="true">
                <span className="trainer-today-tile__icon" aria-hidden>
                  <Gauge size={18} />
                </span>
                <span className="trainer-today-tile__count muted">…</span>
                <span className="trainer-today-tile__label">Качество</span>
                <span className="trainer-today-tile__hint muted">загрузка</span>
              </div>
            ) : (
              <Link
                to="/trainer/profile"
                className="trainer-today-tile trainer-today-tile--cq u-no-decoration"
                title={cqHeadline || undefined}
              >
                <span className="trainer-today-tile__icon" aria-hidden>
                  <Gauge size={18} />
                </span>
                <span className="trainer-today-tile__count">{cqCount}</span>
                <span className="trainer-today-tile__label">Качество</span>
                <span className="trainer-today-tile__hint muted">подробнее</span>
              </Link>
            )}
          </div>
        </div>

        <div className="trainer-today-strip__block trainer-today-strip__block--base">
          <h3 className="trainer-today-strip__block-title">База и поводы</h3>
          {attentionLoading && !summary ? (
            <p className="trainer-today-strip__clients-loading muted">…</p>
          ) : (
            <ul className="trainer-today-strip__cluster trainer-today-strip__cluster--base" aria-label="База и поводы">
              {(baseGroup?.cards ?? []).map((card) => (
                <AttentionTile key={card.key} card={card} />
              ))}
            </ul>
          )}
        </div>

        <div className="trainer-today-strip__block trainer-today-strip__block--path">
          <h3 className="trainer-today-strip__block-title">По абонементу</h3>
          {attentionLoading && !summary ? (
            <p className="trainer-today-strip__clients-loading muted">…</p>
          ) : (
            <ul className="trainer-today-strip__cluster trainer-today-strip__cluster--path" aria-label="По абонементу">
              {(pathGroup?.cards ?? []).map((card) => (
                <AttentionTile key={card.key} card={card} />
              ))}
            </ul>
          )}
        </div>
      </div>

      {clipCount > 0 ? (
        <div className="trainer-today-strip__clips-detail">
          <p className="trainer-today-strip__clips-lead muted">
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
                      {href ? (
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
                    disabled={Boolean(busyId) || !c.client_id}
                    onClick={() => void createFrom(c)}
                  >
                    {busyId === String(c.id) ? '…' : 'Создать по заявке'}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
    </section>
  )
}
