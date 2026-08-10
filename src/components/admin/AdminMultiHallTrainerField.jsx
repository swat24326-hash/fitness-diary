import { useEffect, useState } from 'react'
import { listTrainerSummariesForAdmin } from '../../lib/dataAccess.js'

/**
 * Выбор тренера ПЗ на multi-hall карточке.
 * @param {{
 *   clubId: string,
 *   value: string,
 *   onChange: (trainerId: string) => void,
 *   disabled?: boolean,
 * }} props
 */
export function AdminMultiHallTrainerField({ clubId, value, onChange, disabled = false }) {
  const [trainers, setTrainers] = useState([])
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    let alive = true
    setLoadError('')
    void listTrainerSummariesForAdmin()
      .then((rows) => {
        if (!alive) return
        const cid = String(clubId ?? '').trim()
        const list = (rows ?? []).filter((t) => {
          if (!t?.id) return false
          if (!cid) return true
          return String(t.club_id ?? '') === cid
        })
        setTrainers(list)
      })
      .catch((e) => {
        if (!alive) return
        setTrainers([])
        setLoadError(e?.message || 'Не удалось загрузить тренеров')
      })
    return () => {
      alive = false
    }
  }, [clubId])

  const current = String(value ?? '').trim()
  const known = trainers.some((t) => String(t.id) === current)

  return (
    <label className="admin-desk-client-card__field">
      <span>Тренер ПЗ</span>
      <select
        value={current}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Тренер персонального зала"
      >
        <option value="">— не назначен —</option>
        {current && !known ? <option value={current}>Текущий тренер (не в списке клуба)</option> : null}
        {trainers.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name || t.login || t.id}
          </option>
        ))}
      </select>
      {loadError ? (
        <span className="muted" style={{ fontSize: 12 }}>
          {loadError}
        </span>
      ) : null}
    </label>
  )
}
