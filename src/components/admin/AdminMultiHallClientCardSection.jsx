import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Save } from 'lucide-react'
import { saveLocalWithSync } from '../../lib/syncService.js'
import { dispatchLocalDataChanged } from '../../lib/dataAccess.js'
import { normalizeDeskHall } from '../../lib/admin/deskHallClientsCore.js'
import { formatClientName } from '../../lib/clientNameFormat.js'
import { mergeDeskClientBirthForm } from '../../lib/admin/deskClientBirthFormCore.js'
import { assertClubCardAvailableForCreate } from '../../lib/admin/salesClientMatchCore.js'
import { listClientsByClubId } from '../../lib/localDbClubQuery.js'
import { resolveInitialClientHallTab } from '../../lib/admin/clientHallTabsCore.js'
import { AdminClientHallTabs } from './AdminClientHallTabs.jsx'
import { AdminDeskMembershipLedger } from './AdminDeskMembershipLedger.jsx'
import { AdminMultiHallTrainerField } from './AdminMultiHallTrainerField.jsx'
import { MembershipManager } from '../MembershipManager.jsx'
import { AdminDeskMemDateField } from './AdminDeskMemDateField.jsx'
import { birthDateYearBounds, parseFlexibleDateToIso } from '../../lib/dateRu.js'
import '../../styles/admin-desk.css'

/**
 * Одна CRM-карточка с вкладками ПЗ / ТЗ / АЗ.
 * Не затирает trainer_id (в отличие от чистого desk-only save).
 *
 * @param {{
 *   client: object,
 *   memberships?: object[],
 *   clubId?: string,
 *   listHref?: string,
 *   listBackLabel?: string,
 *   preferredHall?: string|null,
 *   onSaved?: () => void,
 *   hallTab?: 'pz'|'tz'|'az',
 *   onHallTabChange?: (hall: 'pz'|'tz'|'az') => void,
 *   omitPzPane?: boolean,
 * }} props
 */
export function AdminMultiHallClientCardSection({
  client,
  memberships = [],
  clubId = '',
  listHref = '/admin/clients',
  listBackLabel = '← К списку',
  preferredHall = null,
  onSaved,
  hallTab: hallTabProp,
  onHallTabChange,
  /** ПЗ-контент рисует родитель (вкладки тренера / lite) — здесь только шапка и ТЗ/АЗ. */
  omitPzPane = false,
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [hallTabState, setHallTabState] = useState(() =>
    resolveInitialClientHallTab(client, memberships, preferredHall),
  )
  const hallControlled = typeof onHallTabChange === 'function'
  const hallTab = hallControlled ? hallTabProp || hallTabState : hallTabState
  const setHallTab = (next) => {
    if (!hallControlled) setHallTabState(next)
    onHallTabChange?.(next)
  }
  const [form, setForm] = useState({
    name: '',
    phone: '',
    card_number: '',
    birth_date: '',
    trainer_id: '',
  })
  const formClientIdRef = useRef('')
  const birthDirtyRef = useRef(false)
  const savedBirthRef = useRef(/** @type {string | undefined} */ (undefined))

  useEffect(() => {
    const next = resolveInitialClientHallTab(client, memberships, preferredHall)
    if (!hallControlled) setHallTabState(next)
  }, [client?.id, preferredHall, hallControlled, memberships])

  useEffect(() => {
    const id = String(client?.id ?? '')
    const switched = formClientIdRef.current !== id
    formClientIdRef.current = id
    if (switched) {
      birthDirtyRef.current = false
      savedBirthRef.current = undefined
    }
    const fromClientBirth = parseFlexibleDateToIso(client?.birth_date, birthDateYearBounds()) || ''
    if (savedBirthRef.current !== undefined && fromClientBirth === savedBirthRef.current) {
      birthDirtyRef.current = false
      savedBirthRef.current = undefined
    }
    setForm((prev) => ({
      name: client?.name ?? '',
      phone: client?.phone ?? '',
      card_number: client?.card_number ?? '',
      trainer_id: String(client?.trainer_id ?? '').trim(),
      birth_date: mergeDeskClientBirthForm({
        fromClientBirth,
        prevBirth: prev.birth_date,
        switched,
        birthDirty: birthDirtyRef.current,
      }),
    }))
  }, [client])

  const setField = (key, value) => {
    if (key === 'birth_date') birthDirtyRef.current = true
    setForm((f) => ({ ...f, [key]: value }))
  }

  const legacyDesk = useMemo(() => normalizeDeskHall(client?.desk_hall), [client?.desk_hall])

  const save = async (e) => {
    e?.preventDefault?.()
    if (!client?.id) return
    const name = formatClientName(form.name)
    if (!name) {
      setError('Укажите ФИО')
      return
    }
    setBusy(true)
    setError('')
    try {
      const card_number = String(form.card_number ?? '').trim() || null
      const cid = clubId || client.club_id
      if (card_number && cid) {
        const clubClients = await listClientsByClubId(cid)
        const cardCheck = assertClubCardAvailableForCreate(clubClients, cid, card_number, {
          excludeClientId: client.id,
        })
        if (!cardCheck.ok) {
          setError(cardCheck.error)
          return
        }
      }
      const birthIso = parseFlexibleDateToIso(form.birth_date, birthDateYearBounds()) || null
      const savedBirth = birthIso || ''
      const trainer_id = String(form.trainer_id ?? '').trim() || null
      const clientRow = {
        ...client,
        name,
        phone: String(form.phone ?? '').trim() || null,
        card_number,
        birth_date: birthIso,
        trainer_id,
        // legacy desk_hall: не затираем, если нет тренера (constraint); зал абонов — memberships.hall
        desk_hall: trainer_id ? legacyDesk : legacyDesk || null,
      }
      await saveLocalWithSync('clients', clientRow, {
        table_name: 'clients',
        operation: 'update',
        remote_id: client.id,
      })
      savedBirthRef.current = savedBirth
      birthDirtyRef.current = true
      setForm((f) => ({ ...f, birth_date: savedBirth, trainer_id: trainer_id || '' }))
      dispatchLocalDataChanged()
      onSaved?.()
    } catch (err) {
      setError(err?.message || 'Не удалось сохранить')
    } finally {
      setBusy(false)
    }
  }

  const resolvedClubId = String(clubId || client?.club_id || '')

  return (
    <section className="admin-desk-client-card" aria-label="Карточка клиента — залы ПЗ ТЗ АЗ">
      <div className="admin-desk-client-card__nav">
        <Link to={listHref}>{listBackLabel}</Link>
        <span className="admin-desk-client-card__nav-note">Один клиент · абоны по залам</span>
      </div>

      <form className="admin-desk-client-card__form" onSubmit={(e) => void save(e)}>
        <div className="admin-desk-client-card__identity">
          <label className="admin-desk-client-card__name-field">
            ФИО
            <input
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
              required
              autoComplete="name"
              spellCheck={false}
            />
          </label>
          <div className="admin-desk-client-card__meta">
            <label>
              Телефон
              <input
                value={form.phone}
                onChange={(e) => setField('phone', e.target.value)}
                inputMode="tel"
                autoComplete="tel"
              />
            </label>
            <label>
              № карты
              <input
                value={form.card_number}
                onChange={(e) => setField('card_number', e.target.value)}
                inputMode="numeric"
              />
            </label>
            <label>
              Дата рождения
              <AdminDeskMemDateField
                value={form.birth_date}
                allowEmpty
                birthDate
                aria-label="Дата рождения"
                onChange={(iso) => setField('birth_date', iso)}
              />
            </label>
            <AdminMultiHallTrainerField
              clubId={resolvedClubId}
              value={form.trainer_id}
              onChange={(id) => setField('trainer_id', id)}
              disabled={busy}
            />
          </div>
        </div>
        {error ? <p className="sales-report__error admin-desk-client-card__error">{error}</p> : null}
        <div className="admin-desk-client-card__actions">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            <Save size={18} aria-hidden /> {busy ? 'Сохраняю…' : 'Сохранить'}
          </button>
        </div>
      </form>

      <AdminClientHallTabs
        client={client}
        memberships={memberships}
        value={hallTab}
        onChange={setHallTab}
      />

      {hallTab === 'pz' ? (
        omitPzPane ? null : (
          <div className="admin-multi-hall-pane" role="tabpanel">
            {!form.trainer_id ? (
              <p className="muted admin-multi-hall-pane__hint">
                Назначьте тренера ПЗ выше и сохраните карточку — тогда клиент появится на планшете после Sync.
                Ниже — абоны персонального зала на этой же карточке.
              </p>
            ) : null}
            <MembershipManager
              clientId={client.id}
              clubId={resolvedClubId}
              recordTrainerId={form.trainer_id || client.trainer_id}
              membershipHall="pz"
              showPaidAmount
              onChanged={onSaved}
            />
          </div>
        )
      ) : (
        <div className="admin-multi-hall-pane" role="tabpanel">
          <p className="muted admin-multi-hall-pane__hint">
            Абоны {hallTab === 'tz' ? 'ТЗ' : 'АЗ'} на той же карточке. Не создавайте второго клиента с тем же №
            карты.
          </p>
          <AdminDeskMembershipLedger
            client={client}
            memberships={memberships}
            clubId={resolvedClubId}
            hall={hallTab}
            onChanged={onSaved}
          />
        </div>
      )}
    </section>
  )
}
