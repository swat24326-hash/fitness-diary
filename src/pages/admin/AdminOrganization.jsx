import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext, useSearchParams } from 'react-router-dom'
import { Pencil, RefreshCw, Trash2, UserPlus } from 'lucide-react'
import { isSupabaseConfigured } from '../../lib/supabase'
import {
  countClientsByTrainer,
  deleteClubForAdmin,
  removeClubFromLocalCache,
  deleteTrainerForAdmin,
  getClientCountsByTrainerId,
  getClubDeletionBlockers,
  listClubsLocal,
  listTrainersWithClubForAdmin,
  pullClubsFromSupabase,
  saveClubForAdmin,
  updateAllLocalClientsClubForTrainer,
  updateTrainerClubForAdmin,
} from '../../lib/dataAccess'
import { createTrainerForAdmin } from '../../lib/admin/createTrainerService'
import { humanizeNetworkError } from '../../lib/supabaseRetry'

const CREATE_TRAINER_TIMEOUT_MS = 55_000

function raceWithTimeout(promise, ms, timeoutMessage) {
  let id
  const timeout = new Promise((_, reject) => {
    id = setTimeout(() => reject(new Error(timeoutMessage)), ms)
  })
  return Promise.race([promise.finally(() => clearTimeout(id)), timeout])
}

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
  const [clubDeleteConfirm, setClubDeleteConfirm] = useState(null)
  const [trainerDeleteBusyId, setTrainerDeleteBusyId] = useState(null)

  const [clubs, setClubs] = useState([])
  const [clubForm, setClubForm] = useState({ name: '', address: '', phone: '' })
  const [clubEdit, setClubEdit] = useState(null)
  const [clubMsg, setClubMsg] = useState('')
  const [clubPullBusy, setClubPullBusy] = useState(false)
  const [clubSaveBusy, setClubSaveBusy] = useState(false)
  const clubSubmitInFlight = useRef(false)

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

  const reloadClubsList = useCallback(async (opts = {}) => {
    if (!opts.keepMsg) setClubMsg('')
    setClubPullBusy(true)
    try {
      if (opts.forcePull && isSupabaseConfigured() && typeof navigator !== 'undefined' && navigator.onLine) {
        const r = await pullClubsFromSupabase({ force: true })
        if (!r.ok && r.error && !opts.keepMsg) {
          setClubMsg(`${r.error} Показан кэш на устройстве — нажмите ↻ позже.`)
        } else if (r.pruned > 0 && !opts.keepMsg) {
          setClubMsg(
            r.pruned === 1
              ? 'Убран 1 клуб из кэша устройства — в облаке его уже нет.'
              : `Убрано ${r.pruned} клубов из кэша — в облаке их уже нет.`,
          )
        }
        await reloadClubs?.()
      }
      setClubs(await listClubsLocal())
    } finally {
      setClubPullBusy(false)
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
      const { trainers: list, clubColumn: hasCol, listSource, fromCache } = await listTrainersWithClubForAdmin()
      setTrainers(list)
      setClubColumn(hasCol)
      const { counts, source } = await getClientCountsByTrainerId({
        skipRemote: listSource === 'admin_api',
      })
      setClientCounts(counts)
      setClientCountsSource(source)
      if (!hasCol) {
        setTrainerMsg(
          'В таблице users ещё нет колонки club_id. Выполните миграцию в Supabase (файл supabase/migrations/20260210120000_users_club_id.sql), затем обновите страницу.',
        )
      } else if (list.length === 0) {
        setTrainerMsg(
          'Сервер вернул 0 тренеров. Проверьте в Vercel: SUPABASE_SERVICE_ROLE_KEY и URL — тот же проект, что в Table Editor (hrylzinyasucjecltxpc). Выйдите и войдите снова, затем Ctrl+F5.',
        )
      } else if (fromCache) {
        setTrainerMsg(`Показан сохранённый список (${list.length} трен.). Обновите ↻ — проверьте ответ /api/list-trainers в Network.`)
      } else if (listSource === 'admin_api') {
        setTrainerMsg(
          `Загружено тренеров: ${list.length}. ` +
            (source === 'local'
              ? 'Клиентов у каждого — по кэшу на устройстве.'
              : 'Данные из облака.'),
        )
      }
    } catch (e) {
      setTrainerMsg(humanizeNetworkError(e) || e?.message || 'Ошибка загрузки тренеров')
      setTrainers([])
      const { counts, source } = await getClientCountsByTrainerId()
      setClientCounts(counts)
      setClientCountsSource(source)
    } finally {
      setTrainerBusy(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setClubs(await listClubsLocal())
      if (!isSupabaseConfigured() || typeof navigator === 'undefined' || !navigator.onLine) {
        await loadTrainers()
        return
      }
      void loadTrainers()
      const r = await pullClubsFromSupabase({ force: false })
      if (cancelled) return
      setClubs(await listClubsLocal())
      if (!r.ok && r.error) {
        setClubMsg(`${r.error} Показан кэш на устройстве.`)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [loadTrainers])

  const clubSubmit = async (e) => {
    e.preventDefault()
    if (clubSubmitInFlight.current) return
    clubSubmitInFlight.current = true
    setClubMsg('')
    setClubSaveBusy(true)
    const now = new Date().toISOString()
    try {
      let row
      let isNew = false
      if (clubEdit) {
        row = {
          ...clubEdit,
          name: clubForm.name.trim(),
          address: clubForm.address.trim() || null,
          phone: clubForm.phone.trim() || null,
        }
      } else {
        isNew = true
        row = {
          id: crypto.randomUUID(),
          name: clubForm.name.trim(),
          address: clubForm.address.trim() || null,
          phone: clubForm.phone.trim() || null,
          is_active: true,
          created_at: now,
        }
      }
      const { remoteOk, recoveredAfterNetwork } = await saveClubForAdmin(row, { isNew })
      setClubForm({ name: '', address: '', phone: '' })
      setClubEdit(null)
      setClubs(await listClubsLocal())
      if (remoteOk) {
        setClubMsg(
          recoveredAfterNetwork
            ? `Клуб «${row.name}» в облаке (сеть оборвалась, запись проверена). Ошибки 409/RESET в консоли можно игнорировать.`
            : isNew
              ? `Клуб «${row.name}» создан в облаке.`
              : `Клуб «${row.name}» сохранён.`,
        )
        await reloadClubsList({ keepMsg: true, forcePull: true })
      } else {
        setClubMsg(
          `Клуб «${row.name}» в кэше. Сеть оборвалась — откройте меню → «Синхронизировать» или нажмите ↻ через минуту.`,
        )
        await reloadClubsList({ keepMsg: true, forcePull: false })
      }
      await reloadClubs?.()
    } catch (err) {
      const msg = err?.message ?? 'Ошибка сохранения клуба'
      setClubMsg(msg.includes('Supabase') || msg.includes('403') ? msg : `${msg}. Проверьте интернет и повторите.`)
    } finally {
      clubSubmitInFlight.current = false
      setClubSaveBusy(false)
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
      setTrainerMsg('Клуб тренера сохранён в Supabase. Тренеру: выйти и войти снова (или Ctrl+F5), чтобы подтянуть клуб.')
    } catch (e) {
      setTrainerMsg(e?.message ?? 'Не удалось сменить клуб. Проверьте RLS (update users для админа) и миграцию.')
    } finally {
      setReassigningId('')
    }
  }

  const runRemoveClubFromCache = async (c) => {
    if (!c?.id) return
    if (
      !window.confirm(
        `Убрать «${c.name}» только из списка на этом устройстве? В Supabase ничего не меняется — используйте, если клуб уже удалён в Table Editor.`,
      )
    ) {
      return
    }
    setClubDeleteConfirm(null)
    setClubDeleteBusyId(c.id)
    setClubMsg('')
    try {
      await removeClubFromLocalCache(c.id)
      setClubs(await listClubsLocal())
      if (defaultClubFromUrl === c.id) {
        const next = new URLSearchParams(searchParams)
        next.delete('club')
        setSearchParams(next, { replace: true })
      }
      setClubMsg(`Клуб «${c.name}» убран из кэша на устройстве.`)
      await loadTrainers()
    } catch (e) {
      setClubMsg(e?.message ?? 'Не удалось убрать клуб из кэша')
    } finally {
      setClubDeleteBusyId(null)
    }
  }

  const runDeleteClub = async (c) => {
    if (!c?.id) return
    setClubDeleteConfirm(null)
    setClubDeleteBusyId(c.id)
    setClubMsg('Проверяем привязки…')
    try {
      const b = await getClubDeletionBlockers(c.id)
      if (b.blocked) {
        setClubMsg(
          `Клуб «${c.name}» нельзя удалить: клиентов ${b.clients}, тренеров ${b.trainers}, абонементов ${b.memberships}, тренировок ${b.trainings}. Освободите привязки.`,
        )
        return
      }
      setClubMsg('Удаляем клуб…')
      const { remoteOk, alreadyGoneRemote } = await deleteClubForAdmin(c.id)
      setClubs(await listClubsLocal())
      if (defaultClubFromUrl === c.id) {
        const next = new URLSearchParams(searchParams)
        next.delete('club')
        setSearchParams(next, { replace: true })
      }
      if (remoteOk && alreadyGoneRemote) {
        setClubMsg(`Клуб «${c.name}» уже был удалён в облаке — убрали из списка на устройстве.`)
      } else if (remoteOk) {
        setClubMsg(`Клуб «${c.name}» удалён в облаке и на этом устройстве.`)
      } else {
        setClubMsg(
          `Не удалось удалить в Supabase — клуб остался в списке. Меню → «Синхронизировать» или повторите удаление; не используйте «Убрать из кэша», пока строка есть в Table Editor.`,
        )
      }
      try {
        await reloadClubsList({ keepMsg: true, forcePull: remoteOk })
      } catch {
        setClubs(await listClubsLocal())
      }
      await loadTrainers()
    } catch (e) {
      const msg = e?.message ?? 'Не удалось удалить клуб'
      setClubMsg(msg.includes('Supabase') || msg.includes('связи') ? msg : `${msg}. Проверьте интернет и повторите.`)
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
      const { data, error } = await raceWithTimeout(
        createTrainerForAdmin(body),
        CREATE_TRAINER_TIMEOUT_MS,
        'Сервер не ответил за минуту. На Vercel проверьте SUPABASE_SERVICE_ROLE_KEY и сделайте Redeploy.',
      )
      if (error) {
        const detail = error.message || 'Не удалось создать тренера'
        setCreateErr(detail)
        return
      }
      const created = data?.trainer
      if (created?.id) {
        setTrainers((prev) => {
          if (prev.some((t) => t.id === created.id)) return prev
          return [...prev, created].sort((a, b) => String(a.name).localeCompare(String(b.name), 'ru'))
        })
        setClubColumn(true)
        setTrainerMsg(`Тренер «${name}» создан и сохранён в Supabase.`)
      }
      setCreateOpen(false)
      setTrainerForm(initialTrainerForm())
      void loadTrainers()
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
              disabled={clubPullBusy}
              onClick={() => void reloadClubsList({ forcePull: true })}
              aria-label="Обновить клубы"
              title="Обновить"
            >
              <RefreshCw size={20} className={clubPullBusy ? 'icon-spin' : undefined} aria-hidden />
            </button>
          </div>
        </div>
        {clubMsg ? (
          <p
            className="admin-inline-note"
            role="status"
            style={{
              margin: '0 0 12px',
              color:
                clubMsg.includes('удалён') || clubMsg.includes('облаке') || clubMsg.includes('сохранён')
                  ? 'var(--accent-bright, #4ade80)'
                  : 'var(--danger, #f87171)',
            }}
          >
            {clubMsg}
          </p>
        ) : null}
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
            <button type="submit" className="btn btn-primary btn-touch" disabled={clubSaveBusy}>
              {clubSaveBusy ? 'Сохраняем…' : clubEdit ? 'Сохранить клуб' : 'Создать клуб'}
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
                  disabled={clubDeleteBusyId === c.id}
                  onClick={() => setClubDeleteConfirm({ id: c.id, name: c.name ?? 'клуб' })}
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

        {trainers.length > 0 ? (
          <TrainerTable rows={trainers} title={`Все тренеры (${trainers.length})`} />
        ) : null}

        {clubs.map((c) => (
          <TrainerTable key={c.id} rows={trainersByClub.byId.get(c) ?? []} title={c.name} />
        ))}

        <TrainerTable rows={trainersByClub.unassigned} title="Без привязки к клубу" />
      </section>
      ) : null}

      {clubDeleteConfirm ? (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="org-delete-club-title"
          onClick={() => !clubDeleteBusyId && setClubDeleteConfirm(null)}
        >
          <div className="modal-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <h2 id="org-delete-club-title" className="section-title td-section-title" style={{ marginTop: 0 }}>
              Удалить клуб?
            </h2>
            <p style={{ margin: '0 0 16px', lineHeight: 1.5 }}>
              Клуб <strong>{clubDeleteConfirm.name}</strong> будет удалён в Supabase и в кэше браузера. Действие необратимо.
            </p>
            <div className="row" style={{ gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-ghost btn-touch"
                disabled={!!clubDeleteBusyId}
                onClick={() => setClubDeleteConfirm(null)}
              >
                Отмена
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-touch"
                disabled={!!clubDeleteBusyId}
                onClick={() => void runRemoveClubFromCache(clubDeleteConfirm)}
              >
                Убрать из кэша
              </button>
              <button
                type="button"
                className="btn btn-primary btn-touch td-client-delete"
                disabled={!!clubDeleteBusyId}
                onClick={() => void runDeleteClub(clubDeleteConfirm)}
              >
                {clubDeleteBusyId ? 'Удаление…' : 'Удалить'}
              </button>
            </div>
          </div>
        </div>
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
                  Создаётся пользователь в Auth и запись в <code>users</code>. На продакшене нужен{' '}
                  <code>SUPABASE_SERVICE_ROLE_KEY</code> в настройках Vercel (без префикса VITE_).
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
