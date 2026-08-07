import { Link } from 'react-router-dom'
import { AlertTriangle, Cake, CalendarClock, Clock, Gauge, Ticket, UserPlus } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useAwaitingSaleClips } from '../../hooks/useAwaitingSaleClips.js'
import {
  buildTrainerAttentionItems,
  groupTrainerAttentionItems,
} from '../../lib/trainer/trainerAttentionUiCore.js'
import { saleClipAwaitingHours } from '../../lib/admin/saleClipLocalService.js'
import { SalesVisualAlert } from '../sales/SalesVisualAlert.jsx'

const ICONS = {
  pnk: UserPlus,
  birthdays: Cake,
  expiring: Clock,
  expired_recent: AlertTriangle,
  stale: CalendarClock,
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
 * Главная тренера: «Сегодня внимание» — три логичных блока в одном ряду.
 * 1) Заявки / качество  2) База и поводы (ПНК-воронка, ДР)  3) По абонементу
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
  const showCq = Boolean(cqGlance?.hasSignal && cqGlance.headline) || (cqLoading && !cqGlance?.headline)
  const clipCount = clips.length
  const opsCols = 1 + (showCq ? 1 : 0)

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
        ) : summary?.actionable === 0 && clipCount === 0 && !showCq ? (
          <p className="trainer-today-strip__hint muted">Всё спокойно — срочных напоминаний нет.</p>
        ) : (
          <p className="trainer-today-strip__hint muted">
            {clipCount > 0 ? `${clipCount} заявк${clipCount === 1 ? 'а' : clipCount < 5 ? 'и' : 'ок'}` : null}
            {clipCount > 0 && (summary?.actionable > 0 || showCq) ? ' · ' : null}
            {summary?.actionable > 0
              ? `${summary.actionable} ${summary.actionable === 1 ? 'повод' : summary.actionable < 5 ? 'повода' : 'поводов'}`
              : null}
            {showCq && cqGlance?.hasSignal ? (summary?.actionable > 0 || clipCount > 0 ? ' · ' : '') + 'качество' : null}
          </p>
        )}
      </div>

      <div className="trainer-today-strip__rail" style={{ '--today-ops': String(opsCols) }}>
        <div className="trainer-today-strip__block trainer-today-strip__block--ops">
          <h3 className="trainer-today-strip__block-title">Зал</h3>
          <div
            className="trainer-today-strip__cluster trainer-today-strip__cluster--ops"
            aria-label="Заявки и качество"
          >
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

            {showCq ? (
              cqLoading && !cqGlance?.headline ? (
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
                  title={cqGlance.headline}
                >
                  <span className="trainer-today-tile__icon" aria-hidden>
                    <Gauge size={18} />
                  </span>
                  <span className="trainer-today-tile__count">
                    {(() => {
                      const n = (Number(cqGlance.thin) || 0) + (Number(cqGlance.stuck) || 0)
                      return n > 0 ? n : '!'
                    })()}
                  </span>
                  <span className="trainer-today-tile__label">Качество</span>
                  <span className="trainer-today-tile__hint muted">подробнее</span>
                </Link>
              )
            ) : null}
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

      {showCq && cqGlance?.factsPreview?.length ? (
        <ul className="trainer-today-strip__cq-facts">
          {cqGlance.factsPreview.map((f) => (
            <li key={`${f.kind}-${f.clientId}`}>
              <Link to={`/trainer/clients/${f.clientId}`}>{f.clientName}</Link>
              <span className="muted">
                {' '}
                · {f.kind === 'thin_training' ? 'тонкая' : f.kind === 'stuck_bz' ? 'хвост БЗ' : 'хвост ДК'}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
