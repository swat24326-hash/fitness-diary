import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Pencil } from 'lucide-react'
import { ClientDiaries } from '../../components/ClientDiaries'
import { ClientOverview } from './ClientOverview'
import { Statistics } from './Statistics'
import { getLocalClient, hydrateAdminClientWorkspace, listMemberships } from '../../lib/dataAccess'
import { isSupabaseConfigured } from '../../lib/supabase'
import { hasUsableMembershipOnDate } from '../../lib/membershipRules'
import { saveLocalWithSync } from '../../lib/syncService'
import { useAuth } from '../../context/AuthContext'
import { useDebouncedStorageReload, shouldReloadTrainerClientStats } from '../../lib/useDebouncedStorageReload'
import { formatDateRu, todayLocalIso } from '../../lib/dateRu'

function formatClientName(raw) {
  const s = String(raw ?? '').trim().replace(/\s+/g, ' ')
  if (!s) return ''
  const parts = s.split(' ').filter(Boolean)
  const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()

  const last = cap(parts[0])
  const rest = parts.slice(1)

  const toInitials = (x) => {
    const t = String(x ?? '').replace(/\./g, '').trim()
    if (!t) return ''
    if (t.length >= 2 && /^[A-Za-zА-Яа-я]+$/.test(t) && t === t.toUpperCase()) {
      return t
        .slice(0, 2)
        .split('')
        .map((ch) => `${ch}.`)
        .join('')
    }
    if (t.length === 1) return `${t.toUpperCase()}.`
    return cap(t)
  }

  if (rest.length === 0) return last
  if (rest.length === 1) return `${last} ${toInitials(rest[0])}`.trim()
  if (rest.length >= 2) return `${last} ${toInitials(rest[0])}${toInitials(rest[1])}`.trim()
  return s
}

export function ClientCard() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const { isAdmin, isTrainer } = useAuth()
  const adminClientsListHref = useMemo(() => {
    const c = searchParams.get('club')
    return `/admin/clients${c ? `?club=${encodeURIComponent(c)}` : ''}`
  }, [searchParams])
  const adminClubQs = useMemo(() => {
    const c = searchParams.get('club')
    return c ? `?club=${encodeURIComponent(c)}` : ''
  }, [searchParams])
  const [tab, setTab] = useState(() => {
    const t = searchParams.get('tab')
    if (t === 'health' || t === 'memberships' || t === 'diaries' || t === 'stats') return t
    return 'health'
  })
  const [client, setClient] = useState(null)
  const [memberships, setMemberships] = useState([])
  const [editOpen, setEditOpen] = useState(false)
  const [editForm, setEditForm] = useState({ name: '', phone: '', birth_date: '', card_number: '' })
  const [hydrateError, setHydrateError] = useState(null)
  const [archiveBusy, setArchiveBusy] = useState(false)

  const reloadLocal = useCallback(async () => {
    const local = await getLocalClient(id)
    setClient(local ?? null)
    setMemberships(local ? await listMemberships(id) : [])
  }, [id])

  useEffect(() => {
    const t = searchParams.get('tab')
    if (t === 'health' || t === 'memberships' || t === 'diaries' || t === 'stats') {
      setTab(t)
    }
  }, [searchParams])

  const hydrateFromCloudInBackground = useCallback(async () => {
    if (!isSupabaseConfigured() || !navigator.onLine) return
    setHydrateError(null)
    const h = await hydrateAdminClientWorkspace(id, { allowBrowserFallback: false })
    if (h.ok) {
      await reloadLocal()
      return
    }
    if (h.reason === 'not_found') {
      const local = await getLocalClient(id)
      if (!local) {
        setClient(null)
        setMemberships([])
      }
      return
    }
    if (!h.ok && h.reason !== 'not_found') {
      setHydrateError(h.error ?? h.reason ?? 'Ошибка загрузки с сервера')
    }
  }, [id, reloadLocal])

  const reloadFromCloud = useCallback(async () => {
    await reloadLocal()
    if (isAdmin && isSupabaseConfigured()) {
      setHydrateError(null)
      const h = await hydrateAdminClientWorkspace(id)
      if (h.ok) {
        await reloadLocal()
      } else if (h.reason === 'not_found') {
        const local = await getLocalClient(id)
        if (!local) {
          setClient(null)
          setMemberships([])
        }
      } else if (!h.ok && h.reason !== 'not_found') {
        setHydrateError(h.error ?? h.reason ?? 'Ошибка загрузки с сервера')
      }
    }
  }, [id, isAdmin, reloadLocal])

  const hasActiveMembership = useMemo(() => {
    const today = todayLocalIso()
    return hasUsableMembershipOnDate(memberships, today)
  }, [memberships])

  const isArchived = Boolean(client?.archived_at)

  const restoreFromArchive = useCallback(async () => {
    if (!client?.id) return
    setArchiveBusy(true)
    try {
      const row = { ...client, archived_at: null }
      await saveLocalWithSync('clients', row, { table_name: 'clients', operation: 'update', remote_id: client.id })
      await reloadLocal()
    } catch (err) {
      alert(err?.message ?? 'Не удалось вернуть из архива')
    } finally {
      setArchiveBusy(false)
    }
  }, [client, reloadLocal])

  useEffect(() => {
    if (isTrainer && !isAdmin) {
      void reloadLocal()
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        void hydrateFromCloudInBackground()
      }
      return
    }
    void reloadFromCloud()
  }, [isTrainer, isAdmin, reloadLocal, reloadFromCloud, hydrateFromCloudInBackground])

  useDebouncedStorageReload(
    () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        void reloadLocal()
        return
      }
      if (isTrainer && !isAdmin) {
        void hydrateFromCloudInBackground()
        return
      }
      if (isAdmin) {
        void reloadFromCloud()
      }
    },
    { shouldRun: shouldReloadTrainerClientStats },
  )

  const openEdit = () => {
    if (isArchived) {
      alert('Клиент в архиве. Чтобы редактировать и вести тренировки — сначала нажмите «Вернуть из архива».')
      return
    }
    setEditForm({
      name: client.name ?? '',
      phone: client.phone ?? '',
      birth_date: client.birth_date ?? '',
      card_number: client.card_number ?? '',
    })
    setEditOpen(true)
  }

  const saveClient = async (e) => {
    e.preventDefault()
    if (isArchived) {
      alert('Клиент в архиве. Чтобы редактировать — сначала нажмите «Вернуть из архива».')
      return
    }
    const name = formatClientName(editForm.name)
    if (!name) return
    const row = {
      ...client,
      name,
      phone: String(editForm.phone ?? '').trim() || null,
      birth_date: editForm.birth_date || null,
      card_number: String(editForm.card_number ?? '').trim() || null,
    }
    try {
      await saveLocalWithSync('clients', row, { table_name: 'clients', operation: 'update', remote_id: client.id })
    } catch (err) {
      alert(err?.message ?? 'Ошибка сохранения')
      return
    }
    setEditOpen(false)
    await reloadLocal()
  }

  if (!client) {
    const backTo = isAdmin ? adminClientsListHref : '/trainer/clients'
    const backLabel = isAdmin ? 'к списку клиентов' : 'к списку клиентов'
    return (
      <p className="muted">
        Клиент не найден. <Link to={backTo}>Назад {backLabel}</Link>
      </p>
    )
  }

  return (
    <div className="grid" style={{ gap: 18 }}>
      {isAdmin ? (
        <p style={{ margin: 0 }}>
          <Link to={adminClientsListHref} className="u-no-decoration muted" style={{ fontSize: 14 }}>
            ← К списку клиентов
          </Link>
        </p>
      ) : null}
      {hydrateError ? (
        <p className="muted admin-inline-note" role="alert">
          Данные с сервера подгрузились не полностью: {hydrateError}. Показано из локального кэша.
        </p>
      ) : null}
      {isArchived ? (
        <p className="admin-inline-note" style={{ margin: 0 }} role="status">
          Клиент в <strong>архиве</strong>. Просмотр доступен, но все действия (редактирование, абонементы, тренировки) — только после «Вернуть».
          <span style={{ display: 'inline-block', marginLeft: 10 }}>
            <button type="button" className="btn btn-primary btn-touch btn-xs" disabled={archiveBusy} onClick={() => void restoreFromArchive()}>
              {archiveBusy ? '…' : 'Вернуть из архива'}
            </button>
          </span>
        </p>
      ) : null}
      {editOpen && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Редактирование клиента" onClick={() => setEditOpen(false)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Клиент</h3>
            <form onSubmit={saveClient} className="grid" style={{ gap: 10 }}>
              <div className="field" style={{ margin: 0 }}>
                <label className="label">ФИО *</label>
                <input
                  className="input"
                  required
                  value={editForm.name}
                  onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                  onBlur={() => setEditForm((f) => ({ ...f, name: formatClientName(f.name) }))}
                  placeholder="Фамилия И.О. (или Фамилия Имя)"
                />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label className="label">Телефон</label>
                <input className="input" value={editForm.phone} onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))} />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label className="label">Дата рождения</label>
                <input className="input" type="date" value={editForm.birth_date} onChange={(e) => setEditForm((f) => ({ ...f, birth_date: e.target.value }))} />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label className="label">Номер карты</label>
                <input className="input" value={editForm.card_number} onChange={(e) => setEditForm((f) => ({ ...f, card_number: e.target.value }))} />
              </div>
              <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-ghost btn-touch" onClick={() => setEditOpen(false)}>
                  Отмена
                </button>
                <button type="submit" className="btn btn-primary btn-touch">
                  Сохранить
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="row td-client-row" style={{ alignItems: 'flex-start', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12 }}>
        <div className="td-client-left u-grow u-minw-0">
          <div className="row" style={{ alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0, fontSize: '1.35rem' }}>{client.name}</h1>
            <button type="button" className="btn btn-ghost btn-icon-square" aria-label="Редактировать данные клиента" title="Редактировать" onClick={openEdit} disabled={isArchived}>
              <Pencil size={16} aria-hidden />
            </button>
          </div>
          <div className="grid" style={{ marginTop: 6, gap: 4 }}>
            <div className="muted">{client.phone ?? '—'}</div>
            <div className="muted">{client.birth_date ? formatDateRu(client.birth_date) : '—'}</div>
          </div>
          {client.card_number ? (
            <div className="muted" style={{ marginTop: 4, fontSize: 13 }}>
              Карта: {client.card_number}
            </div>
          ) : null}
        </div>
        {!isAdmin ? (
          <div className="row td-client-actions" style={{ flexShrink: 0, alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {isArchived ? (
              <button type="button" className="btn btn-primary btn-touch btn-xs" style={{ opacity: 0.55, pointerEvents: 'auto' }} aria-disabled="true" onClick={() => alert('Клиент в архиве — сначала «Вернуть из архива».')}>
                Новая тренировка
              </button>
            ) : hasActiveMembership ? (
              <Link to={`/trainer/workouts/new?clientId=${client.id}`} className="btn btn-primary btn-touch btn-xs" style={{ textDecoration: 'none' }}>
                Новая тренировка
              </Link>
            ) : (
              <button
                type="button"
                className="btn btn-primary btn-touch btn-xs"
                style={{ opacity: 0.55, pointerEvents: 'auto' }}
                aria-disabled="true"
                title="Нет действующего абонемента"
                onClick={() => alert('Нет действующего абонемента')}
              >
                Новая тренировка
              </button>
            )}
          </div>
        ) : null}
      </div>
      {isAdmin ? (
        <p className="muted" style={{ fontSize: 13, margin: '10px 0 0', lineHeight: 1.45 }}>
          Переназначить тренера или удалить клиента — в списке «Клиенты». Новую тренировку «с нуля» начинает только тренер; правки и черновики доступны здесь и в конструкторе.
        </p>
      ) : null}

      <div className="tabs" role="tablist">
        {[
          { id: 'health', label: 'Здоровье' },
          { id: 'memberships', label: 'Абонементы' },
          { id: 'diaries', label: 'Тренировки' },
          { id: 'stats', label: 'Статистика' },
        ].map((t) => (
          <button key={t.id} type="button" className="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'health' && <ClientOverview client={client} onReload={reloadLocal} section="health" readOnly={isArchived} />}
      {tab === 'memberships' && <ClientOverview client={client} onReload={reloadLocal} section="memberships" readOnly={isArchived} />}
      {tab === 'stats' && <Statistics clientId={client.id} />}
      {tab === 'diaries' && <ClientDiaries client={client} onDataChange={reloadLocal} clubQs={isAdmin ? adminClubQs : ''} readOnly={isArchived} />}
    </div>
  )
}
