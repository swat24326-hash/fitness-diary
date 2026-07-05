import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { RefreshCw, UserPlus } from 'lucide-react'
import { isSupabaseConfigured } from '../../lib/supabase'
import { fetchTrainersViaAdminApi } from '../../lib/admin/adminApiClient'
import { createSalesManagerForAdmin } from '../../lib/admin/createSalesManagerService'
import { listClubsLocal, pullClubsFromSupabase } from '../../lib/dataAccess'

const EMPTY_FORM = {
  name: '',
  login: '',
  email: '',
  phone: '',
  password: '',
  club_id: '',
}

export function AdminSalesManagers() {
  const [clubs, setClubs] = useState([])
  const [managers, setManagers] = useState([])
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

  const loadManagers = useCallback(async () => {
    if (!isSupabaseConfigured()) return
    setBusy(true)
    setMsg('')
    try {
      const data = await fetchTrainersViaAdminApi({ role: 'sales_manager' })
      setManagers(Array.isArray(data?.trainers) ? data.trainers : [])
    } catch (e) {
      setMsg(e?.message ?? 'Не удалось загрузить менеджеров')
      setManagers([])
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    void loadClubs()
    void loadManagers()
  }, [loadClubs, loadManagers])

  useEffect(() => {
    if (!createOpen || saving) return
    const onKey = (e) => {
      if (e.key === 'Escape') setCreateOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [createOpen, saving])

  const closeCreate = () => {
    if (saving) return
    setCreateOpen(false)
  }

  const managersByClub = useMemo(() => {
    const map = new Map()
    for (const m of managers) {
      const cid = String(m.club_id ?? '').trim() || '__none__'
      if (!map.has(cid)) map.set(cid, [])
      map.get(cid).push(m)
    }
    return map
  }, [managers])

  const submitCreate = async (e) => {
    e.preventDefault()
    setSaving(true)
    setMsg('')
    try {
      const result = await createSalesManagerForAdmin({
        name: form.name.trim(),
        login: form.login.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        password: form.password,
        club_id: form.club_id,
      })
      setCreateOpen(false)
      setForm(EMPTY_FORM)
      setMsg(result?.warning ? `Менеджер создан. ${result.warning}` : 'Менеджер по продажам создан.')
      await loadManagers()
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
        aria-labelledby="sales-manager-create-title"
        onClick={closeCreate}
      >
        <div className="modal-panel modal-panel--form" onClick={(e) => e.stopPropagation()}>
          <div className="row" style={{ justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
            <h2 id="sales-manager-create-title" className="section-title td-section-title" style={{ margin: 0 }}>
              Новый менеджер по продажам
            </h2>
            <button type="button" className="btn btn-ghost btn-icon-square" aria-label="Закрыть" title="Закрыть" onClick={closeCreate} disabled={saving}>
              ✕
            </button>
          </div>
          <form className="grid td-modal-form" onSubmit={submitCreate} style={{ gap: 12, marginTop: 12 }}>
            <div className="field">
              <label className="label" htmlFor="sm-club">
                Клуб
              </label>
              <select
                id="sm-club"
                className="select"
                required
                value={form.club_id}
                onChange={(e) => setForm((f) => ({ ...f, club_id: e.target.value }))}
                disabled={saving}
              >
                <option value="">— выберите —</option>
                {clubs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="label" htmlFor="sm-name">
                Имя
              </label>
              <input id="sm-name" className="input" required value={form.name} disabled={saving} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="field">
              <label className="label" htmlFor="sm-login">
                Логин
              </label>
              <input id="sm-login" className="input" required value={form.login} disabled={saving} onChange={(e) => setForm((f) => ({ ...f, login: e.target.value }))} />
            </div>
            <div className="field">
              <label className="label" htmlFor="sm-email">
                Email <span className="muted">(необяз.)</span>
              </label>
              <input id="sm-email" className="input" type="email" value={form.email} disabled={saving} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="field">
              <label className="label" htmlFor="sm-password">
                Пароль
              </label>
              <input id="sm-password" className="input" type="password" required minLength={6} value={form.password} disabled={saving} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
            </div>
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
          Менеджеры по продажам
        </h2>
        <div className="row td-actions">
          <button
            type="button"
            className="btn btn-primary btn-icon-square btn-touch"
            disabled={busy}
            onClick={() => void loadManagers()}
            aria-label="Обновить"
            title="Обновить"
          >
            <RefreshCw size={20} className={busy ? 'icon-spin' : undefined} aria-hidden />
          </button>
          <button
            type="button"
            className="btn btn-primary btn-icon-square btn-touch"
            onClick={() => setCreateOpen(true)}
            aria-label="Новый менеджер"
            title="Новый менеджер"
          >
            <UserPlus size={20} aria-hidden />
          </button>
        </div>
      </div>

      {msg ? <p className="muted admin-inline-note">{msg}</p> : null}

      <p className="muted" style={{ fontSize: 13, margin: '0 0 12px', lineHeight: 1.45 }}>
        Менеджер видит только отчёты продаж своего клуба: «Отчёт за день» и «Статистика». Финансы и ИИ-помощник недоступны.
        После входа — раздел <code className="muted">/sales</code>.
      </p>

      {managers.length === 0 && !busy ? <p className="muted">Менеджеров пока нет.</p> : null}

      {clubs.map((club) => {
        const rows = managersByClub.get(club.id) ?? []
        if (!rows.length) return null
        return (
          <div key={club.id} style={{ marginBottom: 16 }}>
            <h3 className="section-title" style={{ fontSize: '1rem', margin: '0 0 8px' }}>
              {club.name}
            </h3>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Имя</th>
                    <th>Логин</th>
                    <th>Email</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((m) => (
                    <tr key={m.id}>
                      <td>{m.name}</td>
                      <td>{m.login}</td>
                      <td>{m.email ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}

      {(managersByClub.get('__none__') ?? []).length > 0 ? (
        <div style={{ marginBottom: 16 }}>
          <h3 className="section-title" style={{ fontSize: '1rem', margin: '0 0 8px' }}>
            Без клуба
          </h3>
          <ul className="muted">
            {managersByClub.get('__none__').map((m) => (
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
