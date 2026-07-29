import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { User, Users, Trophy, Swords } from 'lucide-react'
import { TrainerAttentionPanel } from '../../components/trainer/TrainerAttentionPanel'
import { TrainerSyncPendingBanner } from '../../components/trainer/TrainerSyncPendingBanner'
import { TrainerCoachQualityGlance } from '../../components/trainer/TrainerCoachQualityGlance'
import { TrainerTaskGlanceWidget } from '../../components/iskra/TrainerTaskGlanceWidget.jsx'
import { TrainerPnkGlanceWidget } from '../../components/pnk/TrainerPnkGlanceWidget.jsx'
import { TrainerPushPrompt } from '../../components/iskra/TrainerPushPrompt.jsx'
import { useAuth } from '../../context/AuthContext'
import {
  loadContextForChallengeLeaderboard,
  buildChallengeLeaderboard,
  isChallengeVisibleForTrainerHome,
  listChallengesForTrainer,
  pullChallengeTrainingsForClubChallenges,
  formatChallengeValueRu,
  formatChallengeMetricRu,
} from '../../lib/dataAccess'
import { listClientsByTrainerId } from '../../lib/localDbClubQuery'
import { addDaysToIso, formatDateRu, todayLocalIso } from '../../lib/dateRu'
import { isAppOnline } from '../../lib/syncService'
import { loadTrainerWorkspaceSnapshot } from '../../lib/trainerWorkspaceCache'
import {
  buildTrainerAttentionSummary,
} from '../../lib/trainer/trainerAttentionSummary'
import { buildTrainerCoachQualityGlance } from '../../lib/trainer/trainerCoachQualityGlanceCore.js'
import { buildCoachQualityForScope } from '../../lib/admin/coachQualityService.js'
import { COACH_QUALITY_PERIOD_DAYS } from '../../lib/admin/coachQualityCore.js'
import { fetchCoachQualityViaApi } from '../../lib/admin/adminApiClient.js'
import {
  useDebouncedStorageReload,
  shouldReloadTrainerChallenges,
  shouldReloadTrainerClientList,
} from '../../lib/useDebouncedStorageReload'
import { useSyncOutboundPoll } from '../../hooks/useSyncOutboundPoll'
import { isSupabaseConfigured } from '../../lib/supabase'

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

/** Один баннер: загрузка — только вращение; готово — свечение и «Скоро начнётся сражение». */
function ChallengesPlaceholder({ phase }) {
  const loading = phase === 'loading'

  return (
    <div
      className={`trainer-challenges__soon trainer-challenges__soon--${loading ? 'loading' : 'ready'}`}
      role="status"
      aria-live="polite"
      aria-busy={loading}
      aria-label={loading ? 'Загрузка' : 'Скоро начнётся сражение'}
    >
      {!loading ? <span className="trainer-challenges__soon-glow" aria-hidden /> : null}
      <span className="trainer-challenges__soon-icon" aria-hidden>
        <Swords size={34} strokeWidth={1.75} />
      </span>
      {!loading ? <p className="trainer-challenges__soon-text">Скоро начнётся сражение</p> : null}
    </div>
  )
}

const INITIAL_CHALLENGES_VIEW = { phase: 'loading', items: [] }

export function TrainerHome() {
  const { user } = useAuth()
  const clubId = user?.club_id ?? ''
  const trainerId = user?.id ?? ''

  const [challengesView, setChallengesView] = useState(INITIAL_CHALLENGES_VIEW)
  const [attentionSummary, setAttentionSummary] = useState(null)
  const [attentionLoading, setAttentionLoading] = useState(true)
  const [cqGlance, setCqGlance] = useState(null)
  const [cqGlanceLoading, setCqGlanceLoading] = useState(false)
  const loadGenRef = useRef(0)
  const attentionGenRef = useRef(0)
  const cqGenRef = useRef(0)
  const syncOutbound = useSyncOutboundPoll({ enabled: isSupabaseConfigured() })

  const loadAttention = useCallback(async (opts = {}) => {
    const silent = opts.silent === true
    if (!trainerId) {
      setAttentionSummary(null)
      setAttentionLoading(false)
      setCqGlance(null)
      setCqGlanceLoading(false)
      return
    }
    const gen = ++attentionGenRef.current
    if (!silent) setAttentionLoading(true)
    try {
      const snap = await loadTrainerWorkspaceSnapshot(trainerId, clubId || null)
      if (gen !== attentionGenRef.current) return
      setAttentionSummary(
        buildTrainerAttentionSummary({
          clients: snap.clients,
          memByClient: snap.memByClient,
          today: todayLocalIso(),
        }),
      )

      // Качество ведения — только после актуального snap; gen CQ отдельный,
      // иначе при отмене loadAttention спиннер «Загрузка…» зависает навсегда.
      const cqGen = ++cqGenRef.current
      if (!silent) setCqGlanceLoading(true)
      void (async () => {
        try {
          const dateTo = todayLocalIso()
          const dateFrom = addDaysToIso(dateTo, -(COACH_QUALITY_PERIOD_DAYS - 1))
          let row = null
          if (clubId && isSupabaseConfigured() && isAppOnline()) {
            try {
              const api = await fetchCoachQualityViaApi({
                clubId,
                dateFrom,
                dateTo,
                trainerId,
                mode: 'glance',
              })
              row = (api?.coachQuality?.trainers ?? []).find(
                (t) => String(t.trainerId) === String(trainerId),
              )
            } catch {
              /* локальный расчёт */
            }
          }
          if (!row) {
            const memberships = Object.values(snap.memByClient ?? {}).flat()
            const cq = await buildCoachQualityForScope({
              clients: snap.clients ?? [],
              trainings: snap.trainings ?? [],
              memberships,
              clubId: clubId || null,
              dateFrom,
              dateTo,
              trainerIdFilter: trainerId,
              skipBrief: true,
            })
            row = (cq.trainers ?? []).find((t) => String(t.trainerId) === String(trainerId))
          }
          if (cqGen !== cqGenRef.current) return
          setCqGlance(buildTrainerCoachQualityGlance(row))
        } catch {
          if (cqGen !== cqGenRef.current) return
          setCqGlance(null)
        } finally {
          if (cqGen === cqGenRef.current) setCqGlanceLoading(false)
        }
      })()
    } catch {
      if (gen !== attentionGenRef.current) return
      if (!silent) setAttentionSummary(null)
      setCqGlance(null)
      setCqGlanceLoading(false)
    } finally {
      if (gen === attentionGenRef.current) setAttentionLoading(false)
    }
  }, [trainerId, clubId])

  const loadChallenges = useCallback(
    async (opts = {}) => {
      const silent = opts.silent === true
      const gen = ++loadGenRef.current

      if (!silent) {
        setChallengesView((v) => ({
          phase: 'loading',
          items: v.items ?? [],
        }))
      }

      try {
        const { challenges, pull, clubIds } = await listChallengesForTrainer(trainerId, clubId, {
          pullRemote: isAppOnline(),
        })
        if (gen !== loadGenRef.current) return

        const active = (challenges ?? []).filter((c) => isChallengeVisibleForTrainerHome(c))
        if (!clubIds.length) {
          setChallengesView({ phase: 'ready', items: [] })
          return
        }
        void pull

        if (isAppOnline() && active.length) {
          const byClub = new Map()
          for (const ch of active) {
            const cid = String(ch.club_id ?? '').trim()
            if (!cid) continue
            if (!byClub.has(cid)) byClub.set(cid, [])
            byClub.get(cid).push(ch)
          }
          for (const [cid, clubChallenges] of byClub) {
            try {
              await pullChallengeTrainingsForClubChallenges(cid, clubChallenges, { notify: false })
            } catch (e) {
              console.warn('[trainer-home] challenge trainings pull', e)
            }
            if (gen !== loadGenRef.current) return
          }
        }

        const clients = await listClientsByTrainerId(trainerId)
        if (gen !== loadGenRef.current) return

        const items = []
        for (const ch of active) {
          const chClub = String(ch.club_id ?? '')
          const myClientIds = new Set(
            (clients ?? [])
              .filter((c) => String(c.trainer_id) === String(trainerId) && String(c.club_id) === chClub)
              .map((c) => c.id),
          )
          const lbCtx = await loadContextForChallengeLeaderboard(chClub, {
            challenge: ch,
            pullRemote: false,
            notifyPull: false,
          })
          const { rows } = buildChallengeLeaderboard(ch, lbCtx)
          const mine = rows
            .filter((r) => myClientIds.has(r.client_id))
            .sort((a, b) => a.rank - b.rank)
            .slice(0, 5)
          items.push({ challenge: ch, mine, totalRanked: rows.length })
        }

        if (gen !== loadGenRef.current) return

        setChallengesView({ phase: 'ready', items })
      } catch {
        if (gen !== loadGenRef.current) return
        setChallengesView({ phase: 'ready', items: [] })
      }
    },
    [clubId, trainerId],
  )

  useEffect(() => {
    void loadChallenges()
    return () => {
      loadGenRef.current += 1
    }
  }, [loadChallenges])

  useEffect(() => {
    void loadAttention()
    return () => {
      attentionGenRef.current += 1
    }
  }, [loadAttention])

  useDebouncedStorageReload(() => loadChallenges({ silent: true }), { shouldRun: shouldReloadTrainerChallenges })
  useDebouncedStorageReload(() => loadAttention({ silent: true }), { shouldRun: shouldReloadTrainerClientList })

  const hasList = challengesView.items.length > 0
  const showPlaceholder = challengesView.phase === 'loading' || !hasList

  const challengeCards = useMemo(() => challengesView.items, [challengesView.items])

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

      <TrainerSyncPendingBanner
        queue={syncOutbound.queue}
        localOnly={syncOutbound.localOnly}
        total={syncOutbound.total}
      />

      <TrainerTaskGlanceWidget clubId={clubId} />
      <TrainerPnkGlanceWidget clubId={clubId} />
      <TrainerPushPrompt clubId={clubId} />

      <TrainerAttentionPanel summary={attentionSummary} loading={attentionLoading} />
      <TrainerCoachQualityGlance glance={cqGlance} loading={cqGlanceLoading} />

      <section className="trainer-challenges" aria-labelledby="trainer-challenges-title">
        <div className="trainer-challenges__head">
          <h2 id="trainer-challenges-title" className="trainer-challenges__title">
            <Trophy size={18} aria-hidden className="trainer-challenges__title-icon" />
            Активные челленджи
          </h2>
        </div>
        {showPlaceholder ? (
          <ChallengesPlaceholder phase={challengesView.phase} />
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
                {ch.description?.trim() ? (
                  <p className="trainer-challenge-card__desc">{ch.description.trim()}</p>
                ) : null}
                <p className="trainer-challenge-card__meta muted">
                  {formatChallengeMetricRu(ch.metric, ch.reference_weight_kg)} · до {formatDateRu(ch.end_date)} ({daysLeftRu(ch.end_date)})
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
