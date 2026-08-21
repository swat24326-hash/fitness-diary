import { useEffect, useState } from 'react'
import { UserPlus } from 'lucide-react'
import { normalizeManualCreateHall } from '../../lib/admin/deskManualClientCreateCore.js'
import { AdminLitePzCreateForm } from './AdminLitePzCreateModal.jsx'
import { AdminDeskHallCreateForm } from './AdminDeskHallCreateForm.jsx'

const HALL_OPTIONS = [
  { id: 'pz', label: 'ПЗ' },
  { id: 'tz', label: 'ТЗ' },
  { id: 'az', label: 'АЗ' },
]

/**
 * Оболочка: новый клиент ПЗ (lite) / ТЗ / АЗ (desk) с выбором зала.
 */
export function AdminClientCreateModal({
  open,
  defaultHall = 'pz',
  clubId = '',
  trainers = [],
  azTypes = [],
  onClose,
  onCreated,
}) {
  const [hall, setHall] = useState(() => normalizeManualCreateHall(defaultHall) || 'pz')

  useEffect(() => {
    if (!open) return
    setHall(normalizeManualCreateHall(defaultHall) || 'pz')
  }, [open, defaultHall])

  if (!open) return null

  const title =
    hall === 'tz' ? 'Новый клиент ТЗ' : hall === 'az' ? 'Новый клиент АЗ' : 'Новый клиент ПЗ'

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-client-create-title"
      onClick={onClose}
    >
      <div className="modal-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
        <h2 id="admin-client-create-title" className="section-title td-section-title" style={{ marginTop: 0 }}>
          <UserPlus size={20} aria-hidden style={{ verticalAlign: -3, marginRight: 8 }} />
          {title}
        </h2>

        <div
          className="admin-clients-segment"
          role="tablist"
          aria-label="Зал нового клиента"
          style={{ marginBottom: 14 }}
        >
          {HALL_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              role="tab"
              className="admin-clients-segment__btn"
              aria-selected={hall === opt.id}
              onClick={() => setHall(opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {hall === 'pz' ? (
          <AdminLitePzCreateForm
            active={open && hall === 'pz'}
            clubId={clubId}
            trainers={trainers}
            onClose={onClose}
            onCreated={(clientId) => onCreated?.(clientId, 'pz')}
            showLead
          />
        ) : (
          <AdminDeskHallCreateForm
            active={open && (hall === 'tz' || hall === 'az')}
            hall={hall}
            clubId={clubId}
            azTypes={azTypes}
            onClose={onClose}
            onCreated={(clientId, createdHall) => onCreated?.(clientId, createdHall)}
          />
        )}
      </div>
    </div>
  )
}
