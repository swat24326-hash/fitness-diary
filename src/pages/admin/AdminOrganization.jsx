import { useCallback, useEffect, useMemo, useState } from 'react'
import { useOutletContext, useSearchParams } from 'react-router-dom'
import { Pencil, RefreshCw, Trash2, UserPlus } from 'lucide-react'
import { isSupabaseConfigured } from '../../lib/supabase'
import {
  countClientsByTrainer,
  deleteClubForAdmin,
  deleteTrainerForAdmin,
  getClientCountsByTrainerId,
  getClubDeletionBlockers,
  listClubsLocal,
  listTrainersWithClubForAdmin,
  pullClubsFromSupabase,
  updateAllLocalClientsClubForTrainer,
  updateTrainerClubForAdmin,
} from '../../lib/dataAccess'
import { saveLocalWithSync } from '../../lib/syncService'
import { supabase } from '../../lib/supabase'

const initialTrainerForm = () => ({
  name: '',
  login: '',
  phone: '',
  email: '',
  password: '',
  club_id: '',
})

export function AdminOrganization({ mode = 'both' } = {}) {
  const { reloadClubs } = useOutletContext() ?? {}
  const [searchParams, setSearchParams] = useSearchParams()
  const defaultClubFromUrl = searchParams.get('club') ?? ''

  const [syncClientsClub, setSyncClientsClub] = useState(true)
  const [clubDeleteBusyId, setClubDeleteBusyId] = useState(null)
  const [trainerDeleteBusyId, setTrainerDeleteBusyId] = useState(null)

  const [clubs, setClubs] = useState([])
  const [clubForm, setClubForm] = useState({ name: '', address: '', phone: '' })
  const [clubEdit, setClubEdit] = useState(null)
  const [clubMsg, setClubMsg] = useState('')
  const [clubBusy, setClubBusy] = useState(false)

  const [trainers, setTrainers] = useState([])
  const [clubColumn, setClubColumn] = useState(true)
  const [clientCounts, setClientCounts] = useState({})
  const [clientCountsSource, setClientCountsSource] = useState('local')
  const [trainerMsg, setTrainerMsg] = useState('')
  const [trainerBusy, setTrainerBusy] = useState(false)
  const [reassigningId, setReassigningId] = useState('')

  const [createOpen, setCreateOpen] = useState(false)
  const [createBusy, setCreateBusy] = useState(false)
  const [createErr, setCreateErr] = useState('')
  const [trainerForm, setTrainerForm] = useState(initialTrainerForm)
  const [trainerActionNote, setTrainerActionNote] = useState('')

  const reloadClubsList = useCallback(async () => {
    setClubMsg('')
    setClubBusy(true)
    try {
      if (isSupabaseConfigured() && typeof navigator !== 'undefined' && navigator.onLine) {
        const r = await pullClubsFromSupabase()
        if (!r.ok && r.error) setClubMsg(r.error)
        await reloadClubs?.()
      }
      setClubs(await listClubsLocal())
    } finally {
      setClubBusy(false)
    }
  }, [reloadClubs])

  const loadTrainers = useCallback(async () => {
    setTrainerMsg('')
    setTrainerBusy(true)
    try {
      if (!isSupabaseConfigured()) {
        setTrainers([])
        setClubColumn(false)
        setTrainerMsg('Настройте Supabase, чтобы видеть тренеров из таблицы users и назначать клуб.')
        const { counts, source } = await getClientCountsByTrainerId()
        setClientCounts(counts)
        setClientCountsSource(source)
        return
      }
      const { trainers: list, clubColumn: hasCol } = await listTrainersWithClubForAdmin()
      setTrainers(list)
      setClubColumn(hasCol)
      const { counts, source } = await getClientCountsByTrainerId()
      setClientCounts(counts)
      setClientCountsSource(source)
      if (!hasCol) {
        setTrainerMsg(
          'В таблице users ещё нет колонки club_id. Выполните миграцию в Supabase (файл supabase/migrations/20260210120000_users_club_id.sql), затем обновите страницу.',
        )
      }
    } catch (e) {
      setTrainerMsg(e?.message ?? 'Ошибка загрузки тренеров')
      setTrainers([])
      const { counts, source } = await getClientCountsByTrainerId()
      setClientCounts(counts)
      setClientCountsSource(source)
    } finally {
      setTrainerBusy(false)
    }
  }, [])

  const reloadAll = useCallback(async () => {
    await reloadClubsList()
    await loadTrainers()
  }, [reloadClubsList, loadTrainers])

  useEffect(() => {
    void reloadAll()
  }, [reloadAll])

  const clubSubmit = async (e) => {
    e.preventDefault()
    setClubMsg('')
    const now = new Date().toISOString()
    try {
      if (clubEdit) {
        const row = {
          ...clubEdit,
          name: clubForm.name.trim(),
          address: clubForm.address.trim() || null,
          phone: clubForm.phone.trim() || null,
        }
        await saveLocalWithSync('clubs', row, { table_name: 'clubs', operation: 'update', remote_id: clubEdit.id })
      } else {
        const id = crypto.randomUUID()
        const row = {
          id,
          name: clubForm.name.trim(),
          address: clubForm.address.trim() || null,
          phone: clubForm.phone.trim() || null,
          is_active: true,
          created_at: now,
        }
        await saveLocalWithSync('clubs', row, { table_name: 'clubs', operation: 'insert', remote_id: null })
      }
      setClubForm({ name: '', address: '', phone: '' })
      setClubEdit(null)
      await reloadClubsList()
      await reloadClubs?.()
    } catch (err) {
      setClubMsg(err?.message ?? 'Ошибка сохранения клуба')
    }
  }

  const startClubEdit = (c) => {
    setClubEdit(c)
    setClubForm({ name: c.name ?? '', address: c.address ?? '', phone: c.phone ?? '' })
  }

  const onReassignClub = async (trainerId, newClubIdStr) => {
    if (!clubColumn || !isSupabaseConfigured()) return
    setReassigningId(trainerId)
    setTrainerMsg('')
    try {
      await updateTrainerClubForAdmin({ trainerId, clubId: newClubIdStr || null })
      if (syncClientsClub) {
        await updateAllLocalClientsClubForTrainer(trainerId, newClubIdStr || null)
      }
      await loadTrainers()
    } catch (e) {
      setTrainerMsg(e?.message ?? 'Не удалось сменить клуб. Проверьте RLS (update users для админа) и миграцию.')
    } finally {
      setReassigningId('')
    }
  }

  const onDeleteClub = async (c) => {
    if (!c?.id) return
    setClubMsg('')
    setClubDeleteBusyId(c.id)
    try {
      const b = await getClubDeletionBlockers(c.id)
      if (b.blocked) {
        setClubMsg(
          `Клуб «${c.name}» нельзя удалить: клиентов ${b.clients}, тренеров в users ${b.trainers}, абонементов ${b.memberships}, тренировок ${b.trainings}. Освободите привязки.`,
        )
        return
      }
      if (!window.confirm(`Удалить клуб «${c.name}» безвозвратно (локальный кэш + очередь синхронизации с облаком)?`)) return
      await deleteClubForAdmin(c.id)
      setClubMsg('Клуб удалён.')
      if (defaultClubFromUrl === c.id) {
        const next = new URLSearchParams(searchParams)
        next.delete('club')
        setSearchParams(next, { replace: true })
      }
      await reloadClubsList()
      await loadTrainers()
    } catch (e) {
      setClubMsg(e?.message ?? 'Не удалось удалить клуб')
    } finally {
      setClubDeleteBusyId(null)
    }
  }

  const onDeleteTrainer = async (tr) => {
    if (!tr?.id || !isSupabaseConfigured()) {
      setTrainerMsg('Удаление тренера доступно только при настроенном Supabase и развёрнутой функции delete-trainer.')
      return
    }
    setTrainerMsg('')
    setTrainerDeleteBusyId(tr.id)
    try {
      const n = await countClientsByTrainer(tr.id)
      if (n > 0) {
        setTrainerMsg(`У тренера «${tr.name ?? tr.id}» есть ${n} клиент(ов). Сначала переназначьте или удалите их.`)
        return
      }
      if (!window.confirm(`Удалить тренера «${tr.name ?? tr.login}» из базы и Supabase Auth? Действие необратимо.`)) return
      await deleteTrainerForAdmin(tr.id)
      setTrainerMsg('Тренер удалён.')
      await loadTrainers()
    } catch (e) {
      setTrainerMsg(e?.message ?? 'Не удалось удалить тренера')
    } finally {
      setTrainerDeleteBusyId(null)
    }
  }

  const openCreateTrainer = () => {
    setTrainerActionNote('')
    setCreateErr('')
    setTrainerForm({ ...initialTrainerForm(), club_id: defaultClubFromUrl || '' })
    setCreateOpen(true)
  }

  const closeCreateTrainer = () => {
    if (createBusy) return
    setCreateOpen(false)
    setCreateErr('')
  }

  const submitCreateTrainer = async (e) => {
    e.preventDefault()
    setCreateErr('')
    if (!isSupabaseConfigured()) {
      setCreateErr('Нужны переменные Supabase в .env')
      return
    }
    const name = trainerForm.name.trim()
    const login = trainerForm.login.trim().toLowerCase()
    const password = trainerForm.password
    if (!name || !login || !password) {
      setCreateErr('Заполните имя, логин и пароль.')
      return
    }
    if (password.length < 6) {
      setCreateErr('Пароль не короче 6 символов.')
      return
    }

    const cid = String(trainerForm.club_id ?? '').trim()
    if (!cid) {
      setCreateErr('Выберите клуб: теперь тренер обязательно привязан к клубу.')
      return
    }

    const body = {
      name,
      login,
      phone: trainerForm.phone.trim() || null,
      password,
      email: trainerForm.email.trim() || undefined,
    }
    body.club_id = cid

    setCreateBusy(true)
    try {
      const { data, error } = await supabase.functions.invoke('create-trainer', { body })
      if (error) {
        let detail = error.message
        try {
          const res = error.context
          if (res && typeof res.json === 'function') {
            const blob = await res.json()
            if (blob?.error) detail = String(blob.error)
          }
        } catch {
          /* ignore */
        }
        if (detail?.includes('Failed to fetch') || detail?.includes('404') || error.message?.includes('non-2xx')) {
          setCreateErr('Функция create-trainer не развёрнута. Команда: supabase functions deploy create-trainer')
        } else {
          setCreateErr(detail || 'Не удалось создать тренера')
        }
        return
      }
      if (data && typeof data === 'object' && 'error' in data && data.error) {
        setCreateErr(String(data.error))
        return
      }
      setCreateOpen(false)
      setTrainerForm(initialTrainerForm())
      await loadTrainers()
    } catch (err) {
      setCreateErr(err?.message ?? 'Ошибка сети')
    } finally {
      setCreateBusy(false)
    }
  }

  const showTrainerStub = (label) => {
    setTrainerActionNote(
      `${label}: смена пароля и блокировка через Edge Functions пока не подключены. Выполните действия в Supabase Dashboard (Auth / users).`,
    )
  }

  const trainersByClub = useMemo(() => {
    const byId = new Map(clubs.map((c) => [c.id, []]))
    const unassigned = []
    for (const tr of trainers) {
      const cid = tr.club_id || null
      if (!cid || !byId.has(cid)) {
        unassigned.push(tr)
      } else {
        byId.get(cid).push(tr)
      }
    }
    return { byId, unassigned }
  }, [trainers, clubs])

  const TrainerTable = ({ rows, title }) => {
    if (!rows.length) return null
    return (
      <div style={{ marginBottom: 20 }}>
        <h3 className="section-title" style={{ fontSize: '1rem', margin: '0 0 10px' }}>
          {title}
        </h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Имя</th>
                <th>Телефон</th>
                <th>Логин</th>
                <th>Статус</th>
                <th>Клиентов</th>
                {clubColumn ? <th>Клуб</th> : null}
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((tr) => (
                <tr key={tr.id}>
                  <td>{tr.name ?? '—'}</td>
                  <td>{tr.phone ?? '—'}</td>
                  <td className="muted">{tr.login ?? '—'}</td>
                  <td>{tr.is_active === false ? 'заблокирован' : 'активен'}</td>
                  <td>{clientCounts[tr.id] ?? 0}</td>
                  {clubColumn ? (
                    <td>
                      <select
                        className="select"
                        style={{ minWidth: 160, maxWidth: 220 }}
                        value={tr.club_id ?? ''}
                        disabled={!!reassigningId || trainerBusy}
                        onChange={(e) => {
                          const v = e.target.value
                          if (!v) {
                            alert('Тренер должен быть привязан к клубу. Выберите клуб из списка.')
                            return
                          }
                          void onReassignClub(tr.id, v)
                        }}
                        aria-label="Клуб тренера"
                      >
                        <option value="">Выберите клуб…</option>
                        {tr.club_id && !clubs.some((c) => c.id === tr.club_id) ? (
                          <option value={tr.club_id}>Текущий клуб (нет в списке)</option>
                        ) : null}
                        {clubs.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      {reassigningId === tr.id ? <span className="muted" style={{ fontSize: 11, marginLeft: 6 }}>…</span> : null}
                    </td>
                  ) : null}
                  <td>
                    <div className="row" style={{ gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                      <button type="button" className="btn btn-ghost btn-touch" style={{ fontSize: 13 }} onClick={() => showTrainerStub('Сброс пароля')}>
                        Сбросить пароль
                      </button>
                      <button type="button" className="btn btn-ghost btn-touch" style={{ fontSize: 13 }} onClick={() => showTrainerStub('Блокировка')}>
                        {tr.is_active === false ? 'Разблокировать' : 'Заблокировать'}
                      </button>
                      {isSupabaseConfigured() ? (
                        <button
                          type="button"
                          className="btn btn-ghost btn-icon-square btn-touch td-client-delete"
                          disabled={trainerDeleteBusyId === tr.id || trainerBusy}
                          aria-label="Удалить тренера"
                          title="Удалить тренера (Auth + users, без клиентов)"
                          onClick={() => void onDeleteTrainer(tr)}
                        >
                          <Trash2 size={16} aria-hidden />
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  const showClubs = mode === 'clubs' || mode === 'both'
  const showTrainers = mode === 'trainers' || mode === 'both'

  return (
    <div className={`grid stagger td-grid${mode !== 'both' ? ' admin-org--tab' : ''}`}>
      {showClubs ? (
      <section className="card">
        <div className="td-section-head">
          <h2 className="section-title td-section-title" style={{ margin: 0 }}>
            Клубы
          </h2>
          <div className="row td-actions">
            <button
              type="button"
              className="btn btn-primary btn-icon-square btn-touch"
              disabled={clubBusy}
              onClick={() => void reloadClubsList()}
              aria-label="Обновить клубы"
              title="Обновить"
            >
              <RefreshCw size={20} className={clubBusy ? 'icon-spin' : undefined} aria-hidden />
            </button>
          </div>
        </div>
        {clubMsg ? <p className="muted">{clubMsg}</p> : null}
        <p className="muted" style={{ fontSize: 13, margin: '0 0 12px', lineHeight: 1.45 }}>
          Администратор ведёт справочник залов: от него зависят фильтры «Клиенты» и «Статистика» в шапке (параметр <code className="muted">?club=</code>
          ), привязка тренеров и club_id у новых клиентов. Удалить клуб можно только если нет связанных клиентов, тренеров, абонементов и тренировок.
        </p>
        <form onSubmit={clubSubmit} className="grid" style={{ gap: 8, marginBottom: 16 }}>
          <input
            className="input"
            placeholder="Название"
            value={clubForm.name}
            onChange={(e) => setClubForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
          <div className="grid grid-2" style={{ gap: 8 }}>
            <input className="input" placeholder="Адрес" value={clubForm.address} onChange={(e) => setClubForm((f) => ({ ...f, address: e.target.value }))} />
            <input className="input" placeholder="Телефон" value={clubForm.phone} onChange={(e) => setClubForm((f) => ({ ...f, phone: e.target.value }))} />
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button type="submit" className="btn btn-primary btn-touch">
              {clubEdit ? 'Сохранить клуб' : 'Создать клуб'}
            </button>
            {clubEdit ? (
              <button
                type="button"
                className="btn btn-ghost btn-touch"
                onClick={() => {
                  setClubEdit(null)
                  setClubForm({ name: '', address: '', phone: '' })
                }}
              >
                Отмена
              </button>
            ) : null}
          </div>
        </form>
        <ul className="list">
          {clubs.map((c) => (
            <li key={c.id} className="list-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
              <div>
                <strong>{c.name}</strong>
                <div className="muted" style={{ fontSize: 13 }}>
                  {c.address ?? '—'} · {c.phone ?? '—'} · {c.is_active === false ? 'неактивен' : 'активен'}
                </div>
              </div>
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-ghost btn-icon-square btn-touch" aria-label="Редактировать клуб" title="Редактировать" onClick={() => startClubEdit(c)}>
                  <Pencil size={16} aria-hidden />
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-icon-square btn-touch td-client-delete"
                  aria-label="Удалить клуб"
                  title="Удалить клуб"
                  disabled={clubDeleteBusyId === c.id || clubBusy}
                  onClick={() => void onDeleteClub(c)}
                >
                  <Trash2 size={16} aria-hidden />
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
      ) : null}

      {showTrainers ? (
      <section className="card">
        <div className="td-section-head">
          <h2 className="section-title td-section-title" style={{ margin: 0 }}>
            Тренеры по клубам
          </h2>
          <div className="row td-actions">
            <button
              type="button"
              className="btn btn-primary btn-icon-square btn-touch"
              disabled={trainerBusy}
              onClick={() => void loadTrainers()}
              aria-label="Обновить тренеров"
              title="Обновить"
            >
              <RefreshCw size={20} className={trainerBusy ? 'icon-spin' : undefined} aria-hidden />
            </button>
            <button type="button" className="btn btn-primary btn-icon-square btn-touch" onClick={openCreateTrainer} aria-label="Новый тренер" title="Новый тренер">
              <UserPlus size={20} aria-hidden />
            </button>
          </div>
        </div>
        {trainerMsg ? <p className="muted admin-inline-note">{trainerMsg}</p> : null}
        {trainerActionNote ? <p className="muted admin-inline-note">{trainerActionNote}</p> : null}
        <label className="row" style={{ gap: 10, alignItems: 'flex-start', margin: '0 0 12px', cursor: 'pointer' }}>
          <input type="checkbox" checked={syncClientsClub} onChange={(e) => setSyncClientsClub(e.target.checked)} style={{ marginTop: 3 }} />
          <span className="muted" style={{ fontSize: 13, lineHeight: 1.45 }}>
            При смене клуба тренера выставлять тот же <strong>club_id</strong> у его клиентов, их абонементов и тренировок (локально + очередь синхронизации). Выключите, если нужно вручную развести данные по залам.
          </span>
        </label>
        <p className="muted" style={{ fontSize: 13, margin: '0 0 10px', lineHeight: 1.45 }}>
          Тренер в приложении видит только клиентов своего клуба (поле <code className="muted">users.club_id</code> в Supabase; в локальном демо — демо-клуб). Колонка «Клуб»: смена зала переносит тренера между блоками. Удаление тренера — из Auth и{' '}
          <code className="muted">users</code>, только если у него нет клиентов; нужна Edge Function <code className="muted">delete-trainer</code>.{' '}
          {clientCountsSource === 'remote'
            ? '«Клиентов» в таблице — по облаку.'
            : isSupabaseConfigured()
              ? '«Клиентов» — по локальному кэшу (RLS или офлайн).'
              : '«Клиентов» — по локальной базе на устройстве.'}
        </p>

        {isSupabaseConfigured() && trainers.length === 0 && !trainerMsg ? (
          <p className="muted">Нет тренеров с ролью trainer в users.</p>
        ) : null}

        {clubs.map((c) => (
          <TrainerTable key={c.id} rows={trainersByClub.byId.get(c) ?? []} title={c.name} />
        ))}

        <TrainerTable rows={trainersByClub.unassigned} title="Без привязки к клубу" />
      </section>
      ) : null}

      {showTrainers && createOpen ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="org-create-trainer-title" onClick={closeCreateTrainer}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <h2 id="org-create-trainer-title" className="section-title td-section-title" style={{ marginTop: 0 }}>
              Новый тренер
            </h2>
            {!isSupabaseConfigured() ? (
              <p className="muted">
                Задайте <code>VITE_SUPABASE_URL</code> и <code>VITE_SUPABASE_ANON_KEY</code> (Supabase → Settings → API): локально в <code>.env</code>, на Vercel — в Environment Variables проекта, затем <strong>Redeploy</strong>.
              </p>
            ) : (
              <form className="grid td-modal-form" onSubmit={submitCreateTrainer} style={{ gap: 12 }}>
                <p className="muted" style={{ margin: '0 0 4px', fontSize: 13 }}>
                  Создаётся пользователь в Auth и запись в <code>users</code>. Edge Function <code>create-trainer</code> должна быть развёрнута.
                </p>
                <div className="field">
                  <label className="label">Клуб при создании</label>
                  <select
                    className="select"
                    value={trainerForm.club_id}
                    onChange={(e) => setTrainerForm((f) => ({ ...f, club_id: e.target.value }))}
                    disabled={createBusy}
                    required
                  >
                    <option value="">Выберите клуб…</option>
                    {clubs.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>
                    По умолчанию подставляется клуб из адресной строки (?club=…), если он есть в списке.
                  </p>
                </div>
                <div className="field">
                  <label className="label" htmlFor="org-tr-name">
                    Имя
                  </label>
                  <input id="org-tr-name" className="input" value={trainerForm.name} onChange={(e) => setTrainerForm((f) => ({ ...f, name: e.target.value }))} disabled={createBusy} />
                </div>
                <div className="field">
                  <label className="label" htmlFor="org-tr-login">
                    Логин
                  </label>
                  <input id="org-tr-login" className="input" value={trainerForm.login} onChange={(e) => setTrainerForm((f) => ({ ...f, login: e.target.value }))} disabled={createBusy} />
                </div>
                <div className="field">
                  <label className="label" htmlFor="org-tr-email">
                    Email <span className="muted">(необязательно)</span>
                  </label>
                  <input id="org-tr-email" type="email" className="input" value={trainerForm.email} onChange={(e) => setTrainerForm((f) => ({ ...f, email: e.target.value }))} disabled={createBusy} />
                </div>
                <div className="field">
                  <label className="label" htmlFor="org-tr-phone">
                    Телефон
                  </label>
                  <input id="org-tr-phone" className="input" value={trainerForm.phone} onChange={(e) => setTrainerForm((f) => ({ ...f, phone: e.target.value }))} disabled={createBusy} />
                </div>
                <div className="field">
                  <label className="label" htmlFor="org-tr-pass">
                    Временный пароль
                  </label>
                  <input id="org-tr-pass" type="password" className="input" value={trainerForm.password} onChange={(e) => setTrainerForm((f) => ({ ...f, password: e.target.value }))} disabled={createBusy} />
                </div>
                {createErr ? (
                  <p className="muted" style={{ color: 'var(--danger, #f87171)', margin: 0 }}>
                    {createErr}
                  </p>
                ) : null}
                <div className="row td-modal-actions" style={{ marginTop: 4 }}>
                  <button type="button" className="btn btn-ghost btn-touch" onClick={closeCreateTrainer} disabled={createBusy}>
                    Отмена
                  </button>
                  <button type="submit" className="btn btn-primary btn-touch" disabled={createBusy}>
                    {createBusy ? 'Создание…' : 'Создать'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
