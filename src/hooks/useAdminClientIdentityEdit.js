import { useEffect, useRef, useState } from 'react'

/**
 * Режим «сначала смотрим — карандаш открывает правку».
 * Снимок формы на вход; «Отменить» откатывает поля и dirty-флаги вызывающего.
 *
 * @param {{
 *   clientId?: string,
 *   form: Record<string, unknown>,
 *   setForm: (next: Record<string, unknown> | ((prev: Record<string, unknown>) => Record<string, unknown>)) => void,
 *   onCancelRestore?: () => void,
 * }} opts
 */
export function useAdminClientIdentityEdit({ clientId, form, setForm, onCancelRestore }) {
  const [editing, setEditing] = useState(false)
  const snapshotRef = useRef(/** @type {Record<string, unknown> | null} */ (null))

  useEffect(() => {
    setEditing(false)
    snapshotRef.current = null
  }, [clientId])

  const beginEdit = () => {
    snapshotRef.current = { ...form }
    setEditing(true)
  }

  const cancelEdit = () => {
    if (snapshotRef.current) setForm(snapshotRef.current)
    onCancelRestore?.()
    snapshotRef.current = null
    setEditing(false)
  }

  const finishEdit = () => {
    snapshotRef.current = null
    setEditing(false)
  }

  return { identityEditing: editing, beginEdit, cancelEdit, finishEdit }
}
