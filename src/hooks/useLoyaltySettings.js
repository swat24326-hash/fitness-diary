import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchLoyaltySettings, postLoyaltySettings } from '../lib/loyalty/loyaltyApiClient.js'
import { isAppOnline } from '../lib/networkReachability.js'
import {
  interpretLoyaltySettingsHttp,
  loyaltyDraftToPostBody,
  loyaltySettingsPostOmitsIntervals,
  loyaltySettingsSaveState,
  loyaltySettingsToDraft,
  loyaltyToggleConfirmText,
} from '../lib/loyalty/loyaltySettingsUiCore.js'

/**
 * Структура → Лояльность: GET/POST loyalty-settings выбранного клуба.
 */
export function useLoyaltySettings(clubId, { isAdmin = false } = {}) {
  const id = String(clubId ?? '').trim()
  const [draft, setDraft] = useState(() => loyaltySettingsToDraft({ enabled: false }))
  const [baselineDraft, setBaselineDraft] = useState(() => loyaltySettingsToDraft({ enabled: false }))
  const [isEditing, setIsEditing] = useState(false)
  const [loadedEnabled, setLoadedEnabled] = useState(false)
  const [intervals, setIntervals] = useState([])
  const [enabledAt, setEnabledAt] = useState(null)
  const [migrationNeeded, setMigrationNeeded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [online, setOnline] = useState(() => isAppOnline())

  useEffect(() => {
    const sync = () => setOnline(isAppOnline())
    window.addEventListener('online', sync)
    window.addEventListener('offline', sync)
    return () => {
      window.removeEventListener('online', sync)
      window.removeEventListener('offline', sync)
    }
  }, [])

  const applyParsed = useCallback((parsed) => {
    const nextDraft = loyaltySettingsToDraft(parsed.settings)
    setDraft(nextDraft)
    setBaselineDraft(nextDraft)
    setIsEditing(false)
    setLoadedEnabled(parsed.settings.enabled === true)
    setIntervals(parsed.settings.enabled_intervals ?? [])
    setEnabledAt(parsed.settings.enabled_at ?? null)
    setMigrationNeeded(parsed.migration_needed === true)
    setError(parsed.ok ? '' : parsed.error)
  }, [])

  const reload = useCallback(async () => {
    if (!id) {
      applyParsed(interpretLoyaltySettingsHttp(200, { ok: true, settings: { enabled: false } }))
      setMsg('')
      return
    }
    setBusy(true)
    setMsg('')
    try {
      const data = await fetchLoyaltySettings(id)
      applyParsed(interpretLoyaltySettingsHttp(200, data))
    } catch (e) {
      applyParsed(interpretLoyaltySettingsHttp(e?.status ?? 500, e?.body ?? { error: e?.message }))
    } finally {
      setBusy(false)
    }
  }, [id, applyParsed])

  useEffect(() => {
    void reload()
  }, [reload])

  const saveState = useMemo(
    () =>
      loyaltySettingsSaveState({
        clubId: id,
        isAdmin,
        online,
        busy,
        migrationNeeded,
      }),
    [id, isAdmin, online, busy, migrationNeeded],
  )

  const patchDraft = useCallback((patch) => {
    if (!isEditing) return
    setDraft((d) => ({ ...d, ...patch }))
    setMsg('')
  }, [isEditing])

  const startEdit = useCallback(() => {
    setIsEditing(true)
    setMsg('')
    setError('')
  }, [])

  const cancelEdit = useCallback(() => {
    setDraft(baselineDraft)
    setIsEditing(false)
    setMsg('')
    setError('')
  }, [baselineDraft])

  const isDirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(baselineDraft), [draft, baselineDraft])

  const save = useCallback(
    async (confirmFn = typeof window !== 'undefined' ? window.confirm.bind(window) : () => true) => {
      if (!saveState.canSave) return { ok: false }
      if (!isEditing || !isDirty) return { ok: false }
      const body = loyaltyDraftToPostBody(draft, id)
      if (!loyaltySettingsPostOmitsIntervals(body)) return { ok: false }
      const confirmText = loyaltyToggleConfirmText(loadedEnabled, body.enabled)
      if (confirmText && !confirmFn(confirmText)) return { ok: false, cancelled: true }
      setBusy(true)
      setError('')
      setMsg('')
      try {
        const data = await postLoyaltySettings(body)
        const parsed = interpretLoyaltySettingsHttp(200, data)
        applyParsed(parsed)
        if (parsed.ok && !parsed.migration_needed) setMsg('Настройки лояльности сохранены')
        return { ok: parsed.ok && !parsed.migration_needed }
      } catch (e) {
        const parsed = interpretLoyaltySettingsHttp(e?.status ?? 500, e?.body ?? { error: e?.message })
        applyParsed(parsed)
        return { ok: false }
      } finally {
        setBusy(false)
      }
    },
    [saveState.canSave, isEditing, isDirty, draft, id, loadedEnabled, applyParsed],
  )

  return {
    clubId: id,
    draft,
    intervals,
    enabledAt,
    loadedEnabled,
    migrationNeeded,
    busy,
    error,
    msg,
    online,
    saveState,
    isEditing,
    isDirty,
    patchDraft,
    startEdit,
    cancelEdit,
    save,
    reload,
  }
}
