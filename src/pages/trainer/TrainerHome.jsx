import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { User, Users, Trophy } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import {
  loadContextForChallengeLeaderboard,
  buildChallengeLeaderboard,
  isChallengeVisibleForTrainerHome,
  listChallengesForTrainer,
  formatChallengeValueRu,
  formatChallengeMetricRu,
} from '../../lib/dataAccess'
import { getAllStore } from '../../lib/localDb'
import { formatDateRu } from '../../lib/dateRu'
import { isAppOnline } from '../../lib/syncService'
import { useDebouncedStorageReload, shouldReloadTrainerChallenges } from '../../lib/useDebouncedStorageReload'

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
  const [challengeHint, setChallengeHint] = useState('')

  const loadChallenges = useCallback(async () => {
    setChallengeBlock((s) => ({ ...s, loading: true }))
    setChallengeHint('')
    try {
      const { challenges, pull, clubIds } = await listChallengesForTrainer(trainerId, clubId, {
        pullRemote: isAppOnline(),
      })
      if (!clubIds.length) {
        setChallengeBlock({ loading: false, items: [] })
        setChallengeHint('Не определён клуб: в админке привяжите тренера к клубу или нажмите Sync после загрузки клиентов.')
        return
      }
      if (pull && !pull.ok && pull.error) {
        setChallengeHint(`Не удалось обновить с сервера: ${pull.error}`)
      } else if ((challenges ?? []).length === 0) {
        setChallengeHint(
          'В облаке пока нет челленджей для вашего клуба. Админ: после создания челленджа нажмите Sync; затем Sync у тренера.',
        )
      }
      const active = (challenges ?? []).filter((c) => isChallengeVisibleForTrainerHome(c))
      if ((challenges ?? []).length > 0 && active.length === 0) {
        setChallengeHint('Челленджи есть, но период уже завершён или статус не «активен».')
      }
      const clients = await getAllStore('clients')
      const items = []
      for (const ch of active) {
        const chClub = String(ch.club_id ?? '')
        const myClientIds = new Set(
          (clients ?? [])
            .filter((c) => String(c.trainer_id) === String(trainerId) && String(c.club_id) === chClub)
            .map((c) => c.id),
        )
        const lbCtx = await loadContextForChallengeLeaderboard(chClub, { challenge: ch, pullRemote: false, notifyPull: false })
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
      setChallengeHint('Ошибка загрузки челленджей. Проверьте интернет и нажмите Sync.')
    }
  }, [clubId, trainerId])

  useEffect(() => {
    void loadChallenges()
  }, [loadChallenges])

  useDebouncedStorageReload(() => loadChallenges({ silent: true }), { shouldRun: shouldReloadTrainerChallenges })

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

      <section className="trainer-challenges" aria-labelledby="trainer-challenges-title">
          <div className="trainer-challenges__head">
            <h2 id="trainer-challenges-title" className="trainer-challenges__title">
              <Trophy size={18} aria-hidden className="trainer-challenges__title-icon" />
              Активные челленджи
            </h2>
          </div>
          {challengeBlock.loading ? (
            <p className="muted trainer-challenges__muted">Загрузка…</p>
          ) : !hasChallenges ? (
            <p className="muted trainer-challenges__muted">
              {challengeHint ||
                'Нет активных челленджей для вашего клуба (статус «активен», период ещё не закончился).'}
            </p>
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

      <section className="trainer-home__tiles" aria-labelledby="trainer-home-sections">
        <h2 id="trainer-home-sections" className="trainer-home__tiles-heading">
          Разделы
        </h2>
        <div className="tile-grid trainer-home__tile-grid">
          <Link to="/trainer/clients" className="feature-tile u-no-decoration">
            <div className="feature-tile__icon">
              <Users size={36} aria-hidden />
            </div>
            <p className="feature-tile__title">Клиенты</p>
          </Link>

          <Link to="/trainer/profile" className="feature-tile u-no-decoration">
            <div className="feature-tile__icon">
              <User size={36} aria-hidden />
            </div>
            <p className="feature-tile__title">Профиль</p>
          </Link>
        </div>
      </section>
    </div>
  )
}
