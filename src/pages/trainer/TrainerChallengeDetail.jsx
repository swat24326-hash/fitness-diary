import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { ChevronLeft, Trophy } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import {
  getChallengeByIdLocal,
  loadContextForChallengeLeaderboard,
  buildChallengeLeaderboard,
  collectTrainerClubIds,
  formatChallengeMetricLabel,
  formatChallengeValueRu,
} from '../../lib/dataAccess'
import { listClientsByTrainerId } from '../../lib/localDbClubQuery'
import { formatDateRu } from '../../lib/dateRu'
import { useDebouncedStorageReload } from '../../lib/useDebouncedStorageReload'

function medalForRank(rank) {
  if (rank === 1) return '🥇'
  if (rank === 2) return '🥈'
  if (rank === 3) return '🥉'
  return ''
}

export function TrainerChallengeDetail() {
  const { challengeId } = useParams()
  const { user } = useAuth()
  const myTrainerId = user?.id ?? ''

  const [challenge, setChallenge] = useState(null)
  const [rows, setRows] = useState([])
  const [exerciseName, setExerciseName] = useState('—')
  const [busy, setBusy] = useState(true)
  const [myClientIds, setMyClientIds] = useState(() => new Set())
  const [accessDenied, setAccessDenied] = useState(false)

  const load = useCallback(
    async ({ silent = false, pullRemote = true } = {}) => {
      if (!challengeId) return
      if (!silent) setBusy(true)
      try {
        const ch = await getChallengeByIdLocal(challengeId)
        setChallenge(ch ?? null)
        if (!ch?.club_id) {
          setAccessDenied(false)
          setRows([])
          setExerciseName('—')
          return
        }
        const trainerClubIds = await collectTrainerClubIds(myTrainerId, user?.club_id ?? '')
        setAccessDenied(!trainerClubIds.includes(String(ch.club_id)))
        const clients = await listClientsByTrainerId(myTrainerId)
        const mine = new Set(
          clients
            .filter((c) => String(c.club_id) === String(ch.club_id))
            .map((c) => c.id),
        )
        setMyClientIds(mine)

        const lbCtx = await loadContextForChallengeLeaderboard(ch.club_id, {
          challenge: ch,
          pullRemote,
          notifyPull: false,
        })
        const built = buildChallengeLeaderboard(ch, lbCtx)
        setRows(built.rows ?? [])
        setExerciseName(built.exerciseName ?? '—')
      } catch {
        if (!silent) {
          setChallenge(null)
          setRows([])
        }
      } finally {
        if (!silent) setBusy(false)
      }
    },
    [challengeId, myTrainerId, user?.club_id],
  )

  useEffect(() => {
    void load({ pullRemote: true })
  }, [load])

  useDebouncedStorageReload(() => load({ silent: true, pullRemote: false }))

  const maxVal = useMemo(() => {
    let m = 0
    for (const r of rows) {
      if (Number.isFinite(r.value) && r.value > m) m = r.value
    }
    return m || 1
  }, [rows])

  if (!challengeId) return <p className="muted">Не указан челлендж.</p>

  if (accessDenied && challenge) {
    return <Navigate to="/trainer" replace />
  }

  if (!busy && !challenge) {
    return (
      <div className="challenge-admin-shell">
        <p>Челлендж не найден.</p>
        <Link to="/trainer" className="btn btn-primary">
          На главную
        </Link>
      </div>
    )
  }

  return (
    <div className="challenge-admin-shell challenge-detail">
      <div className="challenge-detail__toolbar">
        <Link to="/trainer" className="btn btn-ghost challenge-detail__back">
          <ChevronLeft size={18} aria-hidden />
          Главная
        </Link>
      </div>

      {busy && !challenge ? (
        <p className="muted">Загрузка…</p>
      ) : challenge ? (
        <>
          <header className="challenge-detail__hero">
            <div className="challenge-detail__hero-icon" aria-hidden>
              <Trophy size={28} />
            </div>
            <div>
              <h1 className="challenge-detail__title">{challenge.name}</h1>
              <p className="challenge-detail__subtitle">
                <span>{exerciseName}</span>
                <span className="challenge-list-card__dot">·</span>
                <span>{formatChallengeMetricLabel(challenge)}</span>
                <span className="challenge-list-card__dot">·</span>
                <span>
                  {formatDateRu(challenge.start_date)} — {formatDateRu(challenge.end_date)}
                </span>
              </p>
              {challenge.description?.trim() ? (
                <p className="challenge-detail__description">{challenge.description.trim()}</p>
              ) : null}
            </div>
          </header>

          <p className="challenge-trainer-hint muted">Строки ваших клиентов выделены.</p>

          <div className="challenge-table-wrap">
            <table className="challenge-table">
              <thead>
                <tr>
                  <th scope="col">Место</th>
                  <th scope="col">Клиент</th>
                  <th scope="col">Результат</th>
                  <th scope="col">Тренер</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="challenge-table__empty">
                      Пока нет завершённых тренировок с этим упражнением за период.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => {
                    const mine = myClientIds.has(r.client_id)
                    return (
                      <tr
                        key={r.client_id}
                        className={[
                          'challenge-table__row',
                          r.rank === 1 && 'challenge-table__row--rank-1',
                          r.rank === 2 && 'challenge-table__row--rank-2',
                          r.rank === 3 && 'challenge-table__row--rank-3',
                          mine && 'challenge-table__row--mine',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      >
                        <td className="challenge-table__rank">
                          <span
                            className={[
                              'challenge-table__rank-inner',
                              r.rank <= 3 ? 'challenge-table__rank-inner--podium' : '',
                            ]
                              .filter(Boolean)
                              .join(' ')}
                          >
                            <span className="challenge-table__medal" aria-hidden>
                              {medalForRank(r.rank)}
                            </span>
                            <span className="challenge-table__rank-num">{r.rank}</span>
                          </span>
                        </td>
                        <td>
                          <span className="challenge-table__client-name">{r.client_name}</span>
                        </td>
                        <td>
                          <div className="challenge-result-cell">
                            <span className="challenge-result-cell__val">{formatChallengeValueRu(challenge.metric, r.value)}</span>
                            <span className="challenge-result-cell__bar" aria-hidden>
                              <span className="challenge-result-cell__bar-fill" style={{ width: `${Math.min(100, (r.value / maxVal) * 100)}%` }} />
                            </span>
                          </div>
                        </td>
                        <td>
                          <span className="challenge-table__trainer">{r.trainer_name}</span>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  )
}
