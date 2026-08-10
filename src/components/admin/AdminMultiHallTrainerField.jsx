import { useEffect, useRef, useState } from 'react'
import { listTrainerSummariesForAdmin } from '../../lib/dataAccess.js'
import { formatTrainerSelectLabel } from '../../lib/admin/clientTrainerReassignCore.js'

/**
 * Выбор тренера ПЗ на multi-hall карточке.
 * @param {{
 *   clubId: string,
 *   value: string,
 *   onChange: (trainerId: string) => void,
 *   disabled?: boolean,
 *   listScope?: 'club' | 'all',
 *   onCatalogChange?: (trainers: object[]) => void,
 * }} props
 */
export function AdminMultiHallTrainerField({
  clubId,
  value,
  onChange,
  disabled = false,
  listScope = 'club',
  onCatalogChange,
}) {
  const [trainers, setTrainers] = useState([])
  const [loadError, setLoadError] = useState('')
  const onCatalogChangeRef = useRef(onCatalogChange)
  onCatalogChangeRef.current = onCatalogChange

  useEffect(() => {
    let alive = true
    setLoadError('')
    void listTrainerSummariesForAdmin()
      .then((rows) => {
        if (!alive) return
        const cid = String(clubId ?? '').trim()
        const all = (rows ?? []).filter((t) => t?.id)
        const list =
          listScope === 'all' || !cid
            ? all
            : all.filter((t) => String(t.club_id ?? '') === cid)
        setTrainers(list)
        onCatalogChangeRef.current?.(list)
      })
      .catch((e) => {
        if (!alive) return
        setTrainers([])
        onCatalogChangeRef.current?.([])
        setLoadError(e?.message || 'Не удалось загрузить тренеров')
      })
    return () => {
      alive = false
    }
  }, [clubId, listScope])

  const current = String(value ?? '').trim()
  const known = trainers.some((t) => String(t.id) === current)
  const showClub = listScope === 'all'

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
        {current && !known ? <option value={current}>Текущий тренер (не в списке)</option> : null}
        {trainers.map((t) => (
          <option key={t.id} value={t.id}>
            {formatTrainerSelectLabel(t, { showClub })}
          </option>
        ))}
      </select>
      <span className="muted" style={{ fontSize: 12, lineHeight: 1.35 }}>
        {showClub
          ? 'Смена тренера из другого клуба перенесёт клиента в его клуб (спросим подтверждение).'
          : 'Клиент появится у выбранного тренера после Sync.'}
      </span>
      {loadError ? (
        <span className="muted" style={{ fontSize: 12 }}>
          {loadError}
        </span>
      ) : null}
    </label>
  )
}
