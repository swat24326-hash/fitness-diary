import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { User, Users, Trophy } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import {
  LOCAL_DATA_CHANGED,
  listChallengesForClub,
  loadContextForChallengeLeaderboard,
  buildChallengeLeaderboard,
  isChallengeActiveByCalendar,
  formatChallengeValueRu,
  formatChallengeMetricRu,
} from '../../lib/dataAccess'
import { getAllStore } from '../../lib/localDb'
import { formatDateRu } from '../../lib/dateRu'

function daysLeftRu(endDate) {
  const end = String(endDate ?? '').slice(0, 10)
  if (!end) return ''
  const t0 = new Date(`${end}T12:00:00`)
  const t1 = new Date()
  t1.setHours(12, 0, 0, 0)
  const d = Math.ceil((t0 - t1) / 86400000)
  if (d < 0) return 'период завершён'
  if (d === 0) return 'последний день'
  if (d === 1) return 'остался 1 день'
  if (d >= 2 && d <= 4) return `осталось ${d} дня`
  return `осталось ${d} дней`
}

export function TrainerHome() {
  const { user } = useAuth()
  const clubId = user?.club_id ?? ''
  const trainerId = user?.id ?? ''

  const [challengeBlock, setChallengeBlock] = useState({ loading: true, items: [] })

  const loadChallenges = useCallback(async () => {
    if (!clubId) {
      setChallengeBlock({ loading: false, items: [] })
      return
    }
    setChallengeBlock((s) => ({ ...s, loading: true }))
    try {
      const { challenges } = await listChallengesForClub(clubId, { pullRemote: true })
      const active = (challenges ?? []).filter((c) => isChallengeActiveByCalendar(c))
      const clients = await getAllStore('clients')
      const myClientIds = new Set(
        (clients ?? []).filter((c) => String(c.trainer_id) === String(trainerId) && String(c.club_id) === String(clubId)).map((c) => c.id),
      )
      const lbCtx = await loadContextForChallengeLeaderboard(clubId)
      const items = []
      for (const ch of active) {
        const { rows } = buildChallengeLeaderboard(ch, lbCtx)
        const mine = rows
          .filter((r) => myClientIds.has(r.client_id))
          .sort((a, b) => a.rank - b.rank)
          .slice(0, 5)
        items.push({ challenge: ch, mine, totalRanked: rows.length })
      }
      setChallengeBlock({ loading: false, items })
    } catch {
      setChallengeBlock({ loading: false, items: [] })
    }
  }, [clubId, trainerId])

  useEffect(() => {
    void loadChallenges()
  }, [loadChallenges])

  useEffect(() => {
    const fn = () => void loadChallenges()
    window.addEventListener(LOCAL_DATA_CHANGED, fn)
    return () => window.removeEventListener(LOCAL_DATA_CHANGED, fn)
  }, [loadChallenges])

  const hasChallenges = challengeBlock.items.length > 0

  const challengeCards = useMemo(() => challengeBlock.items, [challengeBlock.items])

  return (
    <div className="trainer-home">
      <section className="trainer-home__hero" aria-labelledby="trainer-home-title">
        <div className="trainer-home__hero-text">
          <h1 id="trainer-home-title" className="trainer-home__title">
            <span className="trainer-home__title-eyebrow">фитнес</span>
            <span className="trainer-home__title-display">
              <span className="trainer-home__title-display-accent">Днев</span>
              <span className="trainer-home__title-display-rest">ник</span>
            </span>
          </h1>
          <p className="trainer-home__lead">Контроль. Результат. Профессионализм.</p>
        </div>
        <div className="trainer-home__hero-visual" aria-hidden>
          <div className="trainer-home__hero-glow" />
          <div className="trainer-home__hero-float">
            <i className="fas fa-dumbbell trainer-home__hero-dumbbell-fa" aria-hidden />
          </div>
        </div>
      </section>

      {clubId ? (
        <section className="trainer-challenges" aria-labelledby="trainer-challenges-title">
          <div className="trainer-challenges__head">
            <h2 id="trainer-challenges-title" className="trainer-challenges__title">
              <Trophy size={22} aria-hidden className="trainer-challenges__title-icon" />
              Активные челленджи
            </h2>
          </div>
          {challengeBlock.loading ? (
            <p className="muted trainer-challenges__muted">Загрузка…</p>
          ) : !hasChallenges ? (
            <p className="muted trainer-challenges__muted">Сейчас нет активных челленджей по календарю для вашего клуба.</p>
          ) : (
            <ul className="trainer-challenges__list">
              {challengeCards.map(({ challenge: ch, mine, totalRanked }) => (
                <li key={ch.id} className="trainer-challenge-card">
                  <div className="trainer-challenge-card__top">
                    <h3 className="trainer-challenge-card__name">{ch.name}</h3>
                    <Link to={`/trainer/challenges/${ch.id}`} className="btn btn-sm btn-primary">
                      Подробнее
                    </Link>
                  </div>
                  {ch.description?.trim() ? <p className="trainer-challenge-card__desc">{ch.description.trim()}</p> : null}
                  <p className="trainer-challenge-card__meta muted">
                    {formatChallengeMetricRu(ch.metric)} · до {formatDateRu(ch.end_date)} ({daysLeftRu(ch.end_date)})
                  </p>
                  {mine.length === 0 ? (
                    <p className="trainer-challenge-card__empty muted" style={{ margin: 0 }}>
                      Ваши клиенты пока не в рейтинге по этому упражнению.
                    </p>
                  ) : (
                    <ul className="trainer-challenge-card__clients">
                      {mine.map((r) => (
                        <li key={r.client_id}>
                          <span className="trainer-challenge-card__client-name">{r.client_name}</span>
                          <span className="trainer-challenge-card__client-res">
                            {formatChallengeValueRu(ch.metric, r.value)}
                            {totalRanked > 0 ? (
                              <span className="muted">
                                {' '}
                                ({r.rank} место из {totalRanked})
                              </span>
                            ) : null}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <section className="trainer-home__tiles" aria-labelledby="trainer-home-sections">
        <h2 id="trainer-home-sections" className="trainer-home__tiles-heading">
          Разделы
        </h2>
        <div className="tile-grid trainer-home__tile-grid">
          <Link to="/trainer/clients" className="feature-tile u-no-decoration">
            <div className="feature-tile__icon">
              <Users size={44} aria-hidden />
            </div>
            <p className="feature-tile__title">Клиенты</p>
          </Link>

          <Link to="/trainer/profile" className="feature-tile u-no-decoration">
            <div className="feature-tile__icon">
              <User size={44} aria-hidden />
            </div>
            <p className="feature-tile__title">Профиль</p>
          </Link>
        </div>
      </section>
    </div>
  )
}
