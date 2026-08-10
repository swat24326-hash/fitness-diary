import { Check, Pencil, X } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { normalizeMembershipTypeCode, MEMBERSHIP_TYPE_CODE_MAX_LEN } from '../../lib/membershipTypesCore.js'

/**
 * Переименование code типа абонемента (ПЗ/АЗ) — модалка + иконка.
 * @param {{
 *   type: { id: string, code?: string },
 *   disabled?: boolean,
 *   busy?: boolean,
 *   onRename: (id: string, nextCode: string) => Promise<void> | void,
 * }} props
 */
export function AdminMembershipTypeRenameButton({ type, disabled, busy, onRename }) {
  const titleId = useId()
  const inputId = useId()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  const code = String(type?.code ?? '').trim()
  const typeId = String(type?.id ?? '').trim()

  useEffect(() => {
    if (!open) return
    setDraft(code)
  }, [open, code])

  const close = () => {
    if (saving) return
    setOpen(false)
  }

  const submit = async (e) => {
    e?.preventDefault?.()
    if (!typeId || saving) return
    const next = normalizeMembershipTypeCode(draft)
    if (!next) return
    setSaving(true)
    try {
      await onRename(typeId, next)
      setOpen(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-ghost btn-icon-square"
        aria-label={`Переименовать тип ${code}`}
        title="Переименовать"
        disabled={disabled || busy || !typeId}
        onClick={() => setOpen(true)}
      >
        <Pencil size={16} aria-hidden />
      </button>

      {open ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={close}>
          <div className="modal-panel admin-mt-rename-modal" onClick={(e) => e.stopPropagation()}>
            <h3 id={titleId} style={{ marginTop: 0 }}>
              Переименовать тип
            </h3>
            <p className="muted admin-mt-rename-modal__hint">
              Меняется только название в справочнике. Уже выданные абонементы остаются с этим типом.
              Прайс и отчёты подхватят новое имя после обновления списка типов.
            </p>
            <form onSubmit={(e) => void submit(e)}>
              <div className="field" style={{ marginBottom: 12 }}>
                <label className="label" htmlFor={inputId}>
                  Новое название
                </label>
                <input
                  id={inputId}
                  className="input"
                  maxLength={MEMBERSHIP_TYPE_CODE_MAX_LEN}
                  autoFocus
                  value={draft}
                  disabled={saving}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={code || 'Напр. Dm'}
                />
              </div>
              <div className="row" style={{ justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-ghost btn-touch" disabled={saving} onClick={close}>
                  <X size={16} aria-hidden />
                  Отмена
                </button>
                <button
                  type="submit"
                  className="btn btn-primary btn-touch"
                  disabled={saving || !normalizeMembershipTypeCode(draft)}
                >
                  <Check size={16} aria-hidden />
                  {saving ? 'Сохраняем…' : 'Сохранить'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  )
}
