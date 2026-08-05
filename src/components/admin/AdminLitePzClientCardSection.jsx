import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Save } from 'lucide-react'
import { saveLocalWithSync } from '../../lib/syncService.js'
import { dispatchLocalDataChanged } from '../../lib/dataAccess.js'
import { formatClientName } from '../../lib/clientNameFormat.js'
import { mergeDeskClientBirthForm } from '../../lib/admin/deskClientBirthFormCore.js'
import { AdminDeskMembershipLedger } from './AdminDeskMembershipLedger.jsx'
import { AdminDeskMemDateField } from './AdminDeskMemDateField.jsx'
import { parseFlexibleDateToIso, birthDateYearBounds } from '../../lib/dateRu.js'
import '../../styles/admin-desk.css'

/**
 * Лёгкая карточка ПЗ: тренер без планшета — контакты + ДР + учёт абонов (не desk ТЗ/АЗ).
 */
export function AdminLitePzClientCardSection({
  client,
  memberships = [],
  clubId = '',
  trainerName = '',
  listHref = '/admin/clients',
  listBackLabel = '← К списку',
  onSaved,
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    name: '',
    phone: '',
    card_number: '',
    birth_date: '',
  })
  const formClientIdRef = useRef('')
  const birthDirtyRef = useRef(false)
  /** Ожидаемая ДР после Save, пока props.client ещё со старой датой. */
  const savedBirthRef = useRef(/** @type {string | undefined} */ (undefined))

  useEffect(() => {
    const id = String(client?.id ?? '')
    const switched = formClientIdRef.current !== id
    formClientIdRef.current = id
    if (switched) {
      birthDirtyRef.current = false
      savedBirthRef.current = undefined
    }
    const fromClientBirth = parseFlexibleDateToIso(client?.birth_date, birthDateYearBounds()) || ''
    if (
      savedBirthRef.current !== undefined &&
      fromClientBirth === savedBirthRef.current
    ) {
      birthDirtyRef.current = false
      savedBirthRef.current = undefined
    }
    setForm((prev) => ({
      name: client?.name ?? '',
      phone: client?.phone ?? '',
      card_number: client?.card_number ?? '',
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

  const save = async (e) => {
    e?.preventDefault?.()
    if (!client?.id) return
    const name = formatClientName(form.name)
    if (!name) {
      setError('Укажите ФИО')
      return
    }
    if (!client.trainer_id) {
      setError('У клиента должен быть тренер')
      return
    }
    setBusy(true)
    setError('')
    try {
      const birthIso = parseFlexibleDateToIso(form.birth_date, birthDateYearBounds()) || null
      const savedBirth = birthIso || ''
      const clientRow = {
        ...client,
        name,
        phone: String(form.phone ?? '').trim() || null,
        card_number: String(form.card_number ?? '').trim() || null,
        birth_date: birthIso,
        trainer_id: client.trainer_id,
        desk_hall: null,
      }
      await saveLocalWithSync('clients', clientRow, {
        table_name: 'clients',
        operation: 'update',
        remote_id: client.id,
      })
      savedBirthRef.current = savedBirth
      birthDirtyRef.current = true
      setForm((f) => ({ ...f, birth_date: savedBirth }))
      dispatchLocalDataChanged()
      onSaved?.()
    } catch (err) {
      setError(err?.message || 'Не удалось сохранить')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="admin-desk-client-card" aria-label="Лёгкая карточка клиента ПЗ">
      <div className="admin-desk-client-card__nav">
        <Link to={listHref}>{listBackLabel}</Link>
        <span className="admin-desk-client-card__hall-badge" title="Тренер без планшета — полный дневник пока недоступен">
          ведёт админ
        </span>
        <span className="admin-desk-client-card__nav-note">
          Тренер: {trainerName || '—'} · карта, абон и оплата
        </span>
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
          </div>
        </div>
        {error ? <p className="sales-report__error admin-desk-client-card__error">{error}</p> : null}
        <div className="admin-desk-client-card__actions">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            <Save size={18} aria-hidden /> {busy ? 'Сохраняю…' : 'Сохранить'}
          </button>
        </div>
      </form>

      <AdminDeskMembershipLedger
        client={client}
        memberships={memberships}
        clubId={clubId}
        onChanged={onSaved}
      />
    </section>
  )
}
