import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useOutletContext, useParams, useSearchParams } from 'react-router-dom'
import { ChevronLeft, Trash2, Trophy } from 'lucide-react'
import {
  dispatchLocalDataChanged,
  getChallengeByIdLocal,
  loadContextForChallengeLeaderboard,
  buildChallengeLeaderboard,
  formatChallengeMetricRu,
  formatChallengeValueRu,
  updateChallengeRecord,
  deleteChallengeById,
  listTrainerSummariesForAdmin,
} from '../../lib/dataAccess'
import { formatDateRu } from '../../lib/dateRu'
import { useDebouncedStorageReload } from '../../lib/useDebouncedStorageReload'

function medalForRank(rank) {
  if (rank === 1) return '🥇'
  if (rank === 2) return '🥈'
  if (rank === 3) return '🥉'
  return ''
}

export function AdminChallengeDetail() {
  const { challengeId } = useParams()
  const navigate = useNavigate()
  const ctx = useOutletContext()
  const [search] = useSearchParams()
  const clubIdCtx = ctx?.clubId ?? ''
  const clubQsParam = search.get('club') ?? clubIdCtx ?? ''
  const clubQs = clubQsParam ? `?club=${encodeURIComponent(clubQsParam)}` : ''

  const [challenge, setChallenge] = useState(null)
  const [rows, setRows] = useState([])
  const [exerciseName, setExerciseName] = useState('—')
  const [busy, setBusy] = useState(true)
  const [trainers, setTrainers] = useState([])
  const [trainerFilter, setTrainerFilter] = useState('')
  const [searchClient, setSearchClient] = useState('')
  const [finishing, setFinishing] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const trainerOptions = useMemo(() => {
    if (trainers.length) return trainers
    const m = new Map()
    for (const r of rows) {
      if (r.trainer_id && !m.has(r.trainer_id)) m.set(r.trainer_id, { id: r.trainer_id, name: r.trainer_name || 'Тренер' })
    }
    return [...m.values()]
  }, [trainers, rows])

  const load = useCallback(
    async ({ silent = false, pullRemote = true } = {}) => {
      if (!challengeId) return
      if (!silent) setBusy(true)
      try {
        const ch = await getChallengeByIdLocal(challengeId)
        setChallenge(ch ?? null)
        if (!ch?.club_id) {
          setRows([])
          setExerciseName('—')
          return
        }
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
    [challengeId],
  )

  useEffect(() => {
    void load({ pullRemote: true })
  }, [load])

  useDebouncedStorageReload(() => load({ silent: true, pullRemote: false }))

  useEffect(() => {
    if (!challengeId) return
    let cancelled = false
    ;(async () => {
      try {
        const ch = await getChallengeByIdLocal(challengeId)
        if (cancelled || !ch?.club_id) return
        const t = await listTrainerSummariesForAdmin()
        if (cancelled) return
        setTrainers(Array.isArray(t) ? t.filter((u) => String(u.club_id ?? '') === String(ch.club_id)) : [])
      } catch {
        if (!cancelled) setTrainers([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [challengeId])

  const filteredRows = useMemo(() => {
    const q = searchClient.trim().toLowerCase()
    return rows.filter((r) => {
      if (trainerFilter && String(r.trainer_id) !== String(trainerFilter)) return false
      if (q && !String(r.client_name ?? '').toLowerCase().includes(q)) return false
      return true
    })
  }, [rows, trainerFilter, searchClient])

  const maxVal = useMemo(() => {
    let m = 0
    for (const r of filteredRows) {
      if (Number.isFinite(r.value) && r.value > m) m = r.value
    }
    return m || 1
  }, [filteredRows])

  const completeChallenge = async () => {
    if (!challenge || challenge.status !== 'active') return
    setFinishing(true)
    try {
      await updateChallengeRecord({ ...challenge, status: 'completed' })
      dispatchLocalDataChanged({ reason: 'challenge-completed' })
      await load({ silent: true, pullRemote: false })
    } finally {
      setFinishing(false)
    }
  }

  const deleteChallenge = async () => {
    if (!challenge?.id) return
    if (!window.confirm(`Удалить челлендж «${challenge.name}»? Восстановить запись будет нельзя.`)) return
    setDeleting(true)
    try {
      await deleteChallengeById(challenge.id)
      dispatchLocalDataChanged({ reason: 'challenge-deleted' })
      navigate(`/admin/challenges${clubQs}`)
    } catch (e) {
      alert(e?.message ?? 'Не удалось удалить')
    } finally {
      setDeleting(false)
    }
  }

  if (!challengeId) {
    return <p className="muted">Не указан челлендж.</p>
  }

  if (!busy && !challenge) {
    return (
      <div className="challenge-admin-shell">
        <p>Челлендж не найден в локальном кэше.</p>
        <Link to={`/admin/challenges${clubQs}`} className="btn btn-primary">
          К списку
        </Link>
      </div>
    )
  }

  const readOnly = challenge?.status === 'completed' || challenge?.status === 'cancelled'

  return (
    <div className="challenge-admin-shell challenge-detail">
      <div className="challenge-detail__toolbar">
        <Link to={`/admin/challenges${clubQs}`} className="btn btn-ghost challenge-detail__back">
          <ChevronLeft size={18} aria-hidden />
          Все челленджи
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
                <span>{formatChallengeMetricRu(challenge.metric)}</span>
                <span className="challenge-list-card__dot">·</span>
                <span>
                  {formatDateRu(challenge.start_date)} — {formatDateRu(challenge.end_date)}
                </span>
              </p>
              {challenge.description?.trim() ? (
                <p className="challenge-detail__description">{challenge.description.trim()}</p>
              ) : null}
            </div>
            <div className="challenge-detail__hero-actions">
              {!readOnly ? (
                <button type="button" className="btn btn-secondary" disabled={finishing || deleting} onClick={() => void completeChallenge()}>
                  {finishing ? 'Сохранение…' : 'Завершить челлендж'}
                </button>
              ) : (
                <span className="challenge-pill challenge-pill--done">Только просмотр</span>
              )}
              <button
                type="button"
                className="btn btn-ghost td-client-delete challenge-detail__delete"
                disabled={deleting || finishing}
                onClick={() => void deleteChallenge()}
              >
                <Trash2 size={18} aria-hidden />
                {deleting ? 'Удаление…' : 'Удалить'}
              </button>
            </div>
          </header>

          <div className="challenge-detail__filters">
            <label className="field challenge-detail__search">
              <span className="sr-only">Поиск клиента</span>
              <input className="input" placeholder="Поиск по клиенту…" value={searchClient} onChange={(e) => setSearchClient(e.target.value)} />
            </label>
            <label className="field">
              <span className="field__label sr-only">Тренер</span>
              <select className="input" value={trainerFilter} onChange={(e) => setTrainerFilter(e.target.value)}>
                <option value="">Все тренеры</option>
                {trainerOptions.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

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
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="challenge-table__empty">
                      Нет данных за период или ничего не подошло под фильтр.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((r) => (
                    <tr
                      key={r.client_id}
                      className={[
                        'challenge-table__row',
                        r.rank === 1 && 'challenge-table__row--rank-1',
                        r.rank === 2 && 'challenge-table__row--rank-2',
                        r.rank === 3 && 'challenge-table__row--rank-3',
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
                  ))
                )}
              </tbody>
            </table>
          </div>

          <p className="muted challenge-detail__footer-note">
            Учитываются только тренировки со статусом «завершена» в периоде. Для каждого клиента — лучший результат за все подходы.
          </p>
        </>
      ) : null}
    </div>
  )
}
