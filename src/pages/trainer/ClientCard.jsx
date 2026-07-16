import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Dumbbell, ClipboardList, Pencil } from 'lucide-react'
import { ClientDiaries } from '../../components/ClientDiaries'
import { ClientOverview } from './ClientOverview'
import { ClientNutritionPage } from './ClientNutritionPage'
import { ClientHomeworkPage } from './ClientHomeworkPage'
import { Statistics } from './Statistics'
import { getLocalClient, hydrateAdminClientWorkspace, listMemberships } from '../../lib/dataAccess'
import { isSupabaseConfigured } from '../../lib/supabase'
import { hasUsableMembershipOnDate } from '../../lib/membershipRules'
import { saveLocalWithSync } from '../../lib/syncService'
import { useAuth } from '../../context/AuthContext'
import { useDebouncedStorageReload, shouldReloadTrainerClientStats } from '../../lib/useDebouncedStorageReload'
import { formatDateRu, todayLocalIso } from '../../lib/dateRu'
import { IskraDispatchModal } from '../../components/iskra/IskraDispatchModal.jsx'
import { buildClientCardTaskDraft } from '../../lib/admin/staffTaskCreateCore.js'
import { useClubDispatchRecipients } from '../../hooks/useClubDispatchRecipients.js'
import { listOutreachLogByClientId } from '../../lib/trainer/trainerOutreachLogService.js'
import { ClientPnkPanel } from '../../components/trainer/ClientPnkPanel.jsx'
import { formatClientName } from '../../lib/clientNameFormat.js'
import { isOpenPnkClient, isPnkCardTabVisible } from '../../lib/pnk/pnkStagesCore.js'
import { preparePnkTrialTraining, addPnkTrialMembership } from '../../lib/pnk/pnkLocalService.js'
import {
  OUTREACH_SCENARIO_LABELS,
  normalizeOutreachName,
  normalizeMaxChatUrl,
  resolveClientGreetingName,
} from '../../lib/trainer/trainerClientOutreachCore.js'

export function ClientCard() {
  const { id } = useParams()
  const navigate = useNavigate()
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
    if (
      t === 'health' ||
      t === 'memberships' ||
      t === 'diaries' ||
      t === 'stats' ||
      t === 'nutrition' ||
      t === 'homework'
    ) {
      return t
    }
    return 'health'
  })
  const [client, setClient] = useState(null)
  const [memberships, setMemberships] = useState([])
  const [editOpen, setEditOpen] = useState(false)
  const [editForm, setEditForm] = useState({ name: '', phone: '', birth_date: '', card_number: '', outreach_name: '', max_chat_url: '' })
  const [hydrateError, setHydrateError] = useState(null)
  const [archiveBusy, setArchiveBusy] = useState(false)
  const [taskModalOpen, setTaskModalOpen] = useState(false)
  const [outreachLogs, setOutreachLogs] = useState([])

  useEffect(() => {
    if (!client || !isOpenPnkClient(client)) return
    if (!isPnkCardTabVisible(client, tab)) setTab('health')
  }, [client, tab])

  const taskClubId = useMemo(() => {
    if (!isAdmin || !client) return ''
    return String(client.club_id ?? searchParams.get('club') ?? '').trim()
  }, [isAdmin, client, searchParams])
  const { recipients: taskRecipients } = useClubDispatchRecipients(taskClubId, { includeSalesManagers: true })
  const clientTaskDraft = useMemo(
    () => (client && isAdmin ? buildClientCardTaskDraft(client) : null),
    [client, isAdmin],
  )

  const reloadLocal = useCallback(async () => {
    const local = await getLocalClient(id)
    setClient(local ?? null)
    setMemberships(local ? await listMemberships(id) : [])
  }, [id])

  useEffect(() => {
    if (!id || isAdmin) return
    void listOutreachLogByClientId(id, 3).then(setOutreachLogs)
  }, [id, isAdmin])

  useEffect(() => {
    const t = searchParams.get('tab')
    if (
      t === 'health' ||
      t === 'memberships' ||
      t === 'diaries' ||
      t === 'stats' ||
      t === 'nutrition' ||
      t === 'homework'
    ) {
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
      outreach_name: client.outreach_name ?? '',
      max_chat_url: client.max_chat_url ?? '',
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
    const outreach_name = normalizeOutreachName(editForm.outreach_name) || null
    const max_chat_url = normalizeMaxChatUrl(editForm.max_chat_url) || null
    const row = {
      ...client,
      name,
      phone: String(editForm.phone ?? '').trim() || null,
      birth_date: editForm.birth_date || null,
      card_number: String(editForm.card_number ?? '').trim() || null,
      outreach_name,
      max_chat_url,
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

  const startPnkTraining = useCallback(async () => {
    if (!client?.id) return
    const res = await preparePnkTrialTraining(client, { isAdmin })
    if (!res.ok) {
      alert(res.error || 'Не удалось открыть тренировку')
      return
    }
    if (res.createdMembership) {
      void reloadLocal()
    }
    navigate(res.path)
  }, [client, isAdmin, navigate, reloadLocal])

  const addPnkBz = useCallback(async () => {
    if (!client?.id) return
    const res = await addPnkTrialMembership(client)
    if (!res.ok) {
      alert(res.error || 'Не удалось создать БЗ')
      return
    }
    void reloadLocal()
    alert('Добавлен абонемент БЗ на 1 занятие')
  }, [client, reloadLocal])

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
                  placeholder="Фамилия Имя Отчество или Фамилия И.О."
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
              <div className="field" style={{ margin: 0 }}>
                <label className="label">Имя для сообщений в Max</label>
                <input
                  className="input"
                  value={editForm.outreach_name}
                  onChange={(e) => setEditForm((f) => ({ ...f, outreach_name: e.target.value }))}
                  onBlur={() => setEditForm((f) => ({ ...f, outreach_name: normalizeOutreachName(f.outreach_name) }))}
                  placeholder="Например: Роман"
                />
                <p className="muted" style={{ margin: '4px 0 0', fontSize: 12, lineHeight: 1.35 }}>
                  Для Max: при полном имени во ФИО подставится само (второе слово). Если только инициалы — впишите имя
                  сюда, иначе будет «Привет!» без имени.
                  {(() => {
                    const g = resolveClientGreetingName({
                      name: editForm.name,
                      outreach_name: editForm.outreach_name,
                    })
                    return g ? ` Сейчас: ${g}.` : ' Сейчас: без имени.'
                  })()}
                </p>
              </div>
              <div className="field">
                <label className="label">Ссылка на чат в Max</label>
                <input
                  className="input"
                  value={editForm.max_chat_url}
                  onChange={(e) => setEditForm((f) => ({ ...f, max_chat_url: e.target.value }))}
                  onBlur={() => setEditForm((f) => ({ ...f, max_chat_url: normalizeMaxChatUrl(f.max_chat_url) }))}
                  placeholder="https://max.ru/u/…"
                  title="Max → профиль → Поделиться. Без ссылки — выбор чата вручную."
                  inputMode="url"
                  autoComplete="off"
                />
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
            {isAdmin ? (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={isArchived || !client.trainer_id || !taskRecipients.length}
                title={client.trainer_id ? 'Поставить задание тренеру' : 'У клиента нет тренера'}
                onClick={() => setTaskModalOpen(true)}
              >
                <ClipboardList size={14} aria-hidden style={{ marginRight: 6, verticalAlign: -2 }} />
                Задание
              </button>
            ) : null}
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
          {!isAdmin && outreachLogs.length > 0 ? (
            <div className="trainer-outreach-history muted" style={{ marginTop: 8, fontSize: 12 }}>
              <strong style={{ color: 'var(--text)' }}>Сообщения в Max:</strong>
              <ul className="trainer-outreach-history__list">
                {outreachLogs.map((row) => (
                  <li key={row.id}>
                    {formatDateRu(String(row.created_at).slice(0, 10))} — {OUTREACH_SCENARIO_LABELS[row.scenario] ?? row.scenario}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        {!isAdmin ? (
          <div className="row td-client-actions" style={{ flexShrink: 0, alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {isArchived ? (
              <button
                type="button"
                className="btn btn-primary btn-icon-square btn-touch"
                style={{ opacity: 0.55, pointerEvents: 'auto' }}
                aria-disabled="true"
                aria-label="Новая тренировка"
                title="Новая тренировка"
                onClick={() => alert('Клиент в архиве — сначала «Вернуть из архива».')}
              >
                <Dumbbell size={20} aria-hidden />
              </button>
            ) : hasActiveMembership ? (
              <Link
                to={`/trainer/workouts/new?clientId=${client.id}`}
                className="btn btn-primary btn-icon-square btn-touch u-no-decoration"
                aria-label="Новая тренировка"
                title="Новая тренировка"
              >
                <Dumbbell size={20} aria-hidden />
              </Link>
            ) : (
              <button
                type="button"
                className="btn btn-primary btn-icon-square btn-touch"
                style={{ opacity: 0.55, pointerEvents: 'auto' }}
                aria-disabled="true"
                aria-label="Новая тренировка"
                title="Нет действующего абонемента"
                onClick={() => alert('Нет действующего абонемента')}
              >
                <Dumbbell size={20} aria-hidden />
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

      <ClientPnkPanel
        client={client}
        onUpdated={(next) => {
          setClient(next)
          void reloadLocal()
        }}
        onOpenDiaries={() => setTab('diaries')}
        onStartTraining={isArchived ? undefined : () => startPnkTraining()}
        onAddBz={isArchived ? undefined : () => addPnkBz()}
      />

      <div className="tabs" role="tablist">
        {[
          { id: 'health', label: 'Здоровье' },
          { id: 'nutrition', label: 'Питание' },
          { id: 'homework', label: 'ДЗ' },
          { id: 'memberships', label: 'Абонементы' },
          { id: 'diaries', label: 'Тренировки' },
          { id: 'stats', label: 'Статистика' },
        ]
          .filter((t) => isPnkCardTabVisible(client, t.id))
          .map((t) => (
          <button key={t.id} type="button" className="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'health' && <ClientOverview client={client} onReload={reloadLocal} section="health" readOnly={isArchived} />}
      {tab === 'nutrition' && <ClientNutritionPage client={client} readOnly={isArchived} />}
      {tab === 'homework' && <ClientHomeworkPage client={client} readOnly={isArchived} />}
      {tab === 'memberships' && <ClientOverview client={client} onReload={reloadLocal} section="memberships" readOnly={isArchived} />}
      {tab === 'stats' && <Statistics clientId={client.id} />}
      {tab === 'diaries' && <ClientDiaries client={client} onDataChange={reloadLocal} clubQs={isAdmin ? adminClubQs : ''} readOnly={isArchived} />}

      {isAdmin && clientTaskDraft ? (
        <IskraDispatchModal
          open={taskModalOpen}
          onClose={() => setTaskModalOpen(false)}
          clubId={taskClubId}
          recipients={taskRecipients}
          trainers={taskRecipients}
          defaultDraft={clientTaskDraft}
          defaultRecipientId={clientTaskDraft.default_recipient_id ?? ''}
        />
      ) : null}
    </div>
  )
}
