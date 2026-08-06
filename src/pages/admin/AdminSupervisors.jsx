import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'react-router-dom'
import { RefreshCw, UserPlus } from 'lucide-react'
import { CloseButton } from '../../components/CloseButton'
import { isSupabaseConfigured } from '../../lib/supabase'
import { fetchTrainersViaAdminApi } from '../../lib/admin/adminApiClient'
import { createSupervisorForAdmin } from '../../lib/admin/createSupervisorService'
import {
  clubsForStaffSections,
  filterStaffByClub,
  normalizeClubFilterId,
  shouldShowUnassignedStaff,
} from '../../lib/admin/filterStaffByClub'
import { listClubsLocal, pullClubsFromSupabase } from '../../lib/dataAccess'

const EMPTY_FORM = {
  name: '',
  login: '',
  email: '',
  phone: '',
  password: '',
  club_id: '',
}

export function AdminSupervisors() {
  const [searchParams] = useSearchParams()
  const clubFilterId = normalizeClubFilterId(searchParams.get('club'))
  const [clubs, setClubs] = useState([])
  const [supervisors, setSupervisors] = useState([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const loadClubs = useCallback(async () => {
    if (!isSupabaseConfigured()) return
    try {
      await pullClubsFromSupabase()
      setClubs(await listClubsLocal())
    } catch {
      setClubs(await listClubsLocal())
    }
  }, [])

  const loadSupervisors = useCallback(async () => {
    if (!isSupabaseConfigured()) return
    setBusy(true)
    setMsg('')
    try {
      const data = await fetchTrainersViaAdminApi({ role: 'supervisor' })
      setSupervisors(Array.isArray(data?.trainers) ? data.trainers : [])
    } catch (e) {
      setMsg(e?.message ?? 'Не удалось загрузить управляющих')
      setSupervisors([])
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    void loadClubs()
    void loadSupervisors()
  }, [loadClubs, loadSupervisors])

  useEffect(() => {
    if (!createOpen || saving) return
    const onKey = (e) => {
      if (e.key === 'Escape') setCreateOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [createOpen, saving])

  const openCreate = () => {
    setForm({ ...EMPTY_FORM, club_id: clubFilterId || '' })
    setCreateOpen(true)
  }

  const closeCreate = () => {
    if (saving) return
    setCreateOpen(false)
  }

  const filteredSupervisors = useMemo(
    () => filterStaffByClub(supervisors, clubFilterId),
    [supervisors, clubFilterId],
  )

  const byClub = useMemo(() => {
    const map = new Map()
    for (const m of filteredSupervisors) {
      const cid = String(m.club_id ?? '').trim() || '__none__'
      if (!map.has(cid)) map.set(cid, [])
      map.get(cid).push(m)
    }
    return map
  }, [filteredSupervisors])

  const clubsForSections = useMemo(
    () => clubsForStaffSections(clubs, clubFilterId),
    [clubs, clubFilterId],
  )
  const showUnassigned = shouldShowUnassignedStaff(clubFilterId)
  const filteredClubName = useMemo(() => {
    if (!clubFilterId) return ''
    return clubs.find((c) => String(c.id) === clubFilterId)?.name ?? ''
  }, [clubs, clubFilterId])

  const clubHasSupervisor = useMemo(() => {
    const set = new Set()
    for (const m of supervisors) {
      if (m.is_active === false) continue
      const cid = String(m.club_id ?? '').trim()
      if (cid) set.add(cid)
    }
    return set
  }, [supervisors])

  const submitCreate = async (e) => {
    e.preventDefault()
    setSaving(true)
    setMsg('')
    try {
      await createSupervisorForAdmin({
        name: form.name.trim(),
        login: form.login.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        password: form.password,
        club_id: form.club_id,
      })
      setCreateOpen(false)
      setForm(EMPTY_FORM)
      setMsg('Управляющий создан. После входа — раздел /club (стол клуба). Для зала создайте отдельный профиль тренера.')
      await loadSupervisors()
    } catch (err) {
      setMsg(err?.message ?? 'Ошибка создания')
    } finally {
      setSaving(false)
    }
  }

  const createModal =
    createOpen &&
    createPortal(
      <div
        className="modal-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="supervisor-create-title"
        onClick={closeCreate}
      >
        <div className="modal-panel modal-panel--form" onClick={(e) => e.stopPropagation()}>
          <div className="row" style={{ justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
            <h2 id="supervisor-create-title" className="section-title td-section-title" style={{ margin: 0 }}>
              Новый управляющий
            </h2>
            <CloseButton onClick={closeCreate} disabled={saving} />
          </div>
          <form className="grid td-modal-form" onSubmit={submitCreate} style={{ gap: 12, marginTop: 12 }}>
            <div className="field">
              <label className="label" htmlFor="sv-club">
                Клуб
              </label>
              <select
                id="sv-club"
                className="select"
                required
                value={form.club_id}
                onChange={(e) => setForm((f) => ({ ...f, club_id: e.target.value }))}
                disabled={saving}
              >
                <option value="">— выберите —</option>
                {clubs.map((c) => (
                  <option key={c.id} value={c.id} disabled={clubHasSupervisor.has(c.id)}>
                    {c.name}
                    {clubHasSupervisor.has(c.id) ? ' (уже есть управляющий)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="label" htmlFor="sv-name">
                Имя
              </label>
              <input
                id="sv-name"
                className="input"
                required
                value={form.name}
                disabled={saving}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="field">
              <label className="label" htmlFor="sv-login">
                Логин
              </label>
              <input
                id="sv-login"
                className="input"
                required
                value={form.login}
                disabled={saving}
                onChange={(e) => setForm((f) => ({ ...f, login: e.target.value }))}
              />
            </div>
            <div className="field">
              <label className="label" htmlFor="sv-email">
                Email <span className="muted">(необяз.)</span>
              </label>
              <input
                id="sv-email"
                className="input"
                type="email"
                value={form.email}
                disabled={saving}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="field">
              <label className="label" htmlFor="sv-password">
                Пароль
              </label>
              <input
                id="sv-password"
                className="input"
                type="password"
                required
                minLength={6}
                value={form.password}
                disabled={saving}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              />
            </div>
            <p className="muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.45 }}>
              На клуб — один управляющий. Тренеры создаются во вкладке «Тренеры». Если человек ведёт зал — отдельный
              профиль тренера.
            </p>
            <div className="row td-modal-actions" style={{ marginTop: 4 }}>
              <button type="button" className="btn btn-ghost btn-touch" disabled={saving} onClick={closeCreate}>
                Отмена
              </button>
              <button type="submit" className="btn btn-primary btn-touch" disabled={saving}>
                {saving ? 'Создание…' : 'Создать'}
              </button>
            </div>
          </form>
        </div>
      </div>,
      document.body,
    )

  return (
    <section className="card">
      <div className="td-section-head">
        <h2 className="section-title td-section-title" style={{ margin: 0 }}>
          Управляющие
        </h2>
        <div className="row td-actions">
          <button
            type="button"
            className="btn btn-primary btn-icon-square btn-touch"
            disabled={busy}
            onClick={() => void loadSupervisors()}
            aria-label="Обновить"
            title="Обновить"
          >
            <RefreshCw size={20} className={busy ? 'icon-spin' : undefined} aria-hidden />
          </button>
          <button
            type="button"
            className="btn btn-primary btn-icon-square btn-touch"
            onClick={openCreate}
            aria-label="Новый управляющий"
            title="Новый управляющий"
          >
            <UserPlus size={20} aria-hidden />
          </button>
        </div>
      </div>

      {msg ? <p className="muted admin-inline-note">{msg}</p> : null}

      <p className="muted" style={{ fontSize: 13, margin: '0 0 12px', lineHeight: 1.45 }}>
        Управляющий — почти админ своего клуба: клиенты, статистика, продажи, ПНК, челленджи, планёрка. Вместо
        «Структуры» — «Настройки» (Max и SMS). Журнал удалений и справочники сети — только у вас. После входа —{' '}
        <code className="muted">/club</code>.
      </p>

      {supervisors.length === 0 && !busy ? <p className="muted">Управляющих пока нет.</p> : null}
      {clubFilterId && supervisors.length > 0 && filteredSupervisors.length === 0 && !busy ? (
        <p className="muted">В выбранном клубе управляющих нет.</p>
      ) : null}

      {clubsForSections.map((club) => {
        const rows = byClub.get(club.id) ?? []
        if (!rows.length) return null
        return (
          <div key={club.id} style={{ marginBottom: 16 }}>
            <h3 className="section-title" style={{ fontSize: '1rem', margin: '0 0 8px' }}>
              {clubFilterId ? `Управляющие: ${filteredClubName || club.name}` : club.name}
            </h3>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Имя</th>
                    <th>Логин</th>
                    <th>Email</th>
                    <th>Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((m) => (
                    <tr key={m.id}>
                      <td>{m.name}</td>
                      <td>{m.login}</td>
                      <td>{m.email ?? '—'}</td>
                      <td>{m.is_active === false ? 'выкл.' : 'активен'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}

      {showUnassigned && (byClub.get('__none__') ?? []).length > 0 ? (
        <div style={{ marginBottom: 16 }}>
          <h3 className="section-title" style={{ fontSize: '1rem', margin: '0 0 8px' }}>
            Без клуба
          </h3>
          <ul className="muted">
            {byClub.get('__none__').map((m) => (
              <li key={m.id}>
                {m.name} ({m.login})
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {createModal}
    </section>
  )
}
