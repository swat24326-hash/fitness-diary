import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Save } from 'lucide-react'
import { saveLocalWithSync } from '../../lib/syncService.js'
import { dispatchLocalDataChanged } from '../../lib/dataAccess.js'
import { normalizeDeskHall } from '../../lib/admin/deskHallClientsCore.js'
import { formatClientName } from '../../lib/clientNameFormat.js'
import { AdminDeskMembershipLedger } from './AdminDeskMembershipLedger.jsx'
import '../../styles/admin-desk.css'

/**
 * Desk-карточка ТЗ/АЗ без тренера: контакты + учёт абонов (пакет по сроку, цена).
 */
export function AdminDeskClientCardSection({
  client,
  memberships = [],
  clubId = '',
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
    desk_hall: '',
  })

  useEffect(() => {
    setForm({
      name: client?.name ?? '',
      phone: client?.phone ?? '',
      card_number: client?.card_number ?? '',
      desk_hall: normalizeDeskHall(client?.desk_hall) || '',
    })
  }, [client])

  const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }))
  const hall = normalizeDeskHall(form.desk_hall)

  const save = async (e) => {
    e?.preventDefault?.()
    if (!client?.id) return
    const name = formatClientName(form.name)
    if (!name) {
      setError('Укажите ФИО')
      return
    }
    if (!hall) {
      setError('Укажите зал: ТЗ или АЗ — иначе клиент не попадёт во вкладку')
      return
    }
    setBusy(true)
    setError('')
    try {
      const clientRow = {
        ...client,
        name,
        phone: String(form.phone ?? '').trim() || null,
        card_number: String(form.card_number ?? '').trim() || null,
        trainer_id: null,
        desk_hall: hall,
      }
      await saveLocalWithSync('clients', clientRow, {
        table_name: 'clients',
        operation: 'update',
        remote_id: client.id,
      })
      dispatchLocalDataChanged()
      onSaved?.()
    } catch (err) {
      setError(err?.message || 'Не удалось сохранить')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="admin-desk-client-card" aria-label="Desk-карточка клиента ТЗ/АЗ">
      <div className="admin-desk-client-card__nav">
        <Link to={listHref}>{listBackLabel}</Link>
        {hall ? (
          <span className={`admin-desk-client-card__hall-badge admin-desk-client-card__hall-badge--${hall}`}>
            {hall === 'tz' ? 'ТЗ' : 'АЗ'}
          </span>
        ) : null}
        <span className="admin-desk-client-card__nav-note">Без тренера · учёт по сроку</span>
      </div>
      <h1 className="admin-desk-client-card__title">{form.name || 'Клиент'}</h1>
      <form className="admin-desk-client-card__form" onSubmit={(e) => void save(e)}>
        <label>
          ФИО
          <input value={form.name} onChange={(e) => setField('name', e.target.value)} required autoComplete="name" />
        </label>
        <label>
          Телефон
          <input value={form.phone} onChange={(e) => setField('phone', e.target.value)} inputMode="tel" />
        </label>
        <label>
          № карты
          <input value={form.card_number} onChange={(e) => setField('card_number', e.target.value)} />
        </label>
        <label>
          Зал
          <select value={form.desk_hall} onChange={(e) => setField('desk_hall', e.target.value)} required>
            <option value="">Выберите…</option>
            <option value="tz">ТЗ</option>
            <option value="az">АЗ</option>
          </select>
        </label>
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
