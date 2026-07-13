import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ClipboardList, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { AdminSectionHeader } from '../../components/admin/AdminSectionHeader.jsx'
import { fetchTrainersViaAdminApi } from '../../lib/admin/adminApiClient'
import { dispatchStatusLabelRu } from '../../lib/admin/iskraDispatchCore.js'
import { deleteIskraDispatch, fetchIskraDispatch } from '../../lib/admin/iskraDispatchService.js'
import { staffTaskSourceChannelLabel } from '../../lib/admin/staffTaskCreateCore.js'
import { isQaAutoUser } from '../../lib/admin/qaAutoUserCore.js'
import { listClubsLocal, pullClubsFromSupabase } from '../../lib/dataAccess'
import { IskraDispatchModal } from '../../components/iskra/IskraDispatchModal.jsx'
import { DispatchTaskProgressBar } from '../../components/iskra/DispatchTaskProgressBar.jsx'

const STATUS_FILTERS = [
  { id: '', label: 'Все' },
  { id: 'pending', label: 'Новые' },
  { id: 'seen', label: 'Просмотрено' },
  { id: 'accepted', label: 'В работе' },
  { id: 'done', label: 'Выполнено' },
  { id: 'declined', label: 'Отклонено' },
]

function priorityLabelRu(priority) {
  return String(priority) === 'high' ? 'Высокий' : 'Обычный'
}

export function AdminClubTasks() {
  const { supabaseReady } = useAuth()
  const [searchParams] = useSearchParams()
  const clubId = searchParams.get('club')?.trim() ?? ''

  const [clubName, setClubName] = useState('—')
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [trainers, setTrainers] = useState([])
  const [modalOpen, setModalOpen] = useState(false)
  const [migrationPending, setMigrationPending] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState('')
  const [deleteBusyId, setDeleteBusyId] = useState('')

  useEffect(() => {
    let alive = true
    const loadClub = async () => {
      try {
        if (supabaseReady) await pullClubsFromSupabase()
        const clubs = await listClubsLocal()
        const hit = clubs.find((c) => String(c.id) === clubId)
        if (alive) setClubName(hit?.name ?? (clubId || '—'))
      } catch {
        if (alive) setClubName(clubId || '—')
      }
    }
    void loadClub()
    return () => {
      alive = false
    }
  }, [clubId, supabaseReady])

  const loadTrainers = useCallback(async () => {
    if (!clubId) {
      setTrainers([])
      return
    }
    try {
      const data = await fetchTrainersViaAdminApi()
      const list = (data?.trainers ?? [])
        .filter((t) => String(t.club_id ?? '') === clubId && t.is_active !== false && !isQaAutoUser(t))
        .map((t) => ({
          trainer_id: String(t.id),
          trainer_name: String(t.name ?? '').trim() || String(t.id),
        }))
      setTrainers(list)
    } catch {
      setTrainers([])
    }
  }, [clubId])

  const reload = useCallback(async () => {
    if (!clubId) {
      setItems([])
      setMigrationPending(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      const data = await fetchIskraDispatch({
        clubId,
        view: 'sent',
        status: statusFilter || undefined,
        limit: 50,
      })
      setItems(Array.isArray(data?.items) ? data.items : [])
      setMigrationPending(Boolean(data?.migration_pending))
    } catch (e) {
      setError(e?.message ? String(e.message) : 'Не удалось загрузить задания')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [clubId, statusFilter])

  useEffect(() => {
    void loadTrainers()
  }, [loadTrainers])

  useEffect(() => {
    void reload()
  }, [reload])

  const activeCount = useMemo(
    () => items.filter((i) => ['pending', 'seen', 'accepted'].includes(i.status)).length,
    [items],
  )

  const handleDelete = async (item) => {
    if (!clubId || !item?.id) return
    setDeleteBusyId(item.id)
    setError('')
    try {
      await deleteIskraDispatch({ dispatchId: item.id, clubId })
      setDeleteConfirmId('')
      await reload()
    } catch (e) {
      setError(e?.message ? String(e.message) : 'Не удалось удалить задание')
    } finally {
      setDeleteBusyId('')
    }
  }

  const sectionLead = clubId
    ? `Задания команде · ${clubName}`
    : 'Выберите клуб в шапке или на главной админки'

  return (
    <section className="admin-section-shell" aria-label="Планёрка">
      <AdminSectionHeader
        icon={ClipboardList}
        title="Планёрка"
        lead={sectionLead}
      >
        <button
          type="button"
          className="btn btn-ghost btn-icon-square"
          disabled={loading || !clubId}
          onClick={() => void reload()}
          aria-label="Обновить список"
          title="Обновить"
        >
          <RefreshCw size={18} aria-hidden className={loading ? 'icon-spin' : undefined} />
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!clubId || !trainers.length}
          onClick={() => setModalOpen(true)}
        >
          <Plus size={16} aria-hidden />
          Новое задание
        </button>
      </AdminSectionHeader>

      {!clubId ? (
        <div className="admin-section__empty-card">
          <ClipboardList size={40} aria-hidden className="admin-section__empty-card__icon" />
          <p className="admin-section__empty-card__title">Выберите клуб</p>
          <p className="muted" style={{ margin: 0 }}>
            Откройте <Link to="/admin">главную админки</Link> и укажите клуб в адресной строке (?club=…).
          </p>
        </div>
      ) : (
        <>
          <p className="admin-section__stats muted">
            Открытых: <strong>{activeCount}</strong> · Всего в списке: {items.length}
          </p>

          <div className="admin-section__tabs" role="tablist" aria-label="Фильтр по статусу">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.id || 'all'}
                type="button"
                role="tab"
                aria-selected={statusFilter === f.id}
                className={`admin-section__tab${statusFilter === f.id ? ' admin-section__tab--on' : ''}`}
                disabled={loading}
                onClick={() => setStatusFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>

          {migrationPending ? (
            <p className="admin-section__banner admin-section__banner--warn" role="status">
              Таблица заданий ещё не на проде — примените миграцию Supabase.
            </p>
          ) : null}

          {error ? (
            <p className="admin-section__banner admin-section__banner--error" role="alert">
              {error}
            </p>
          ) : null}

          {loading && !items.length ? <p className="muted admin-section__empty">Загрузка…</p> : null}

          {!loading && !items.length && !error ? (
            <div className="admin-section__empty-card">
              <ClipboardList size={36} aria-hidden className="admin-section__empty-card__icon" />
              <p className="admin-section__empty-card__title">Пока нет заданий</p>
              <p className="muted" style={{ margin: 0 }}>
                Нажмите «Новое задание» или назначьте из карточки ИСКРЫ.
              </p>
            </div>
          ) : null}

          {items.length ? (
            <ul className="admin-task-list">
              {items.map((item) => (
                <li
                  key={item.id}
                  className={`admin-task-card admin-task-card--${item.status}${item.is_overdue ? ' admin-task-card--overdue' : ''}`}
                >
                  <div className="admin-task-card__top">
                    <div className="admin-task-card__badges">
                      <span className={`admin-task-card__status admin-task-card__status--${item.status}`}>
                        {dispatchStatusLabelRu(item.status)}
                      </span>
                      {item.priority === 'high' ? (
                        <span className="admin-task-card__priority">Высокий приоритет</span>
                      ) : null}
                    </div>
                  </div>
                  <h2 className="admin-task-card__title">{item.title}</h2>
                  <p className="admin-task-card__body muted">{item.body}</p>
                  <DispatchTaskProgressBar progress={item.progress} />
                  <dl className="admin-task-card__meta">
                    <div>
                      <dt>Исполнитель</dt>
                      <dd>{item.recipient_name || '—'}</dd>
                    </div>
                    <div>
                      <dt>Канал</dt>
                      <dd>{staffTaskSourceChannelLabel(item.source_channel)}</dd>
                    </div>
                    <div>
                      <dt>Срок</dt>
                      <dd>{item.due_label || 'Без срока'}</dd>
                    </div>
                    <div>
                      <dt>Приоритет</dt>
                      <dd>{priorityLabelRu(item.priority)}</dd>
                    </div>
                  </dl>
                  {item.recipient_reply ? (
                    <p className="admin-task-card__reply muted">Ответ: {item.recipient_reply}</p>
                  ) : null}
                  <div className="admin-task-card__foot">
                    {deleteConfirmId === item.id ? (
                      <>
                        <span className="admin-task-card__delete-prompt muted">
                          Удалить задание у {item.recipient_name || 'исполнителя'}?
                        </span>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm admin-task-card__delete-yes"
                          disabled={deleteBusyId === item.id}
                          onClick={() => void handleDelete(item)}
                        >
                          {deleteBusyId === item.id ? 'Удаление…' : 'Да, удалить'}
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={deleteBusyId === item.id}
                          onClick={() => setDeleteConfirmId('')}
                        >
                          Отмена
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm admin-task-card__delete"
                        disabled={!!deleteBusyId}
                        onClick={() => setDeleteConfirmId(item.id)}
                      >
                        <Trash2 size={14} aria-hidden />
                        Удалить
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}

      <IskraDispatchModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        clubId={clubId}
        clubName={clubName}
        trainers={trainers}
        manualMode
        onSent={() => void reload()}
      />
    </section>
  )
}
