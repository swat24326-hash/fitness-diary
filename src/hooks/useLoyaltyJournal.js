import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchLoyaltyJournal } from '../lib/loyalty/loyaltyApiClient.js'
import { filterLoyaltyJournalRows, formatLoyaltyJournalRow } from '../lib/loyalty/loyaltyJournalUiCore.js'

/**
 * Журнал списаний клуба (GET loyalty-journal).
 */
export function useLoyaltyJournal(clubId) {
  const id = String(clubId ?? '').trim()
  const [rows, setRows] = useState([])
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    if (!id) {
      setRows([])
      return
    }
    setBusy(true)
    setError('')
    try {
      const data = await fetchLoyaltyJournal(id)
      const list = Array.isArray(data?.rows) ? data.rows : []
      setRows(list.map((r) => formatLoyaltyJournalRow(r)))
    } catch (e) {
      setRows([])
      setError(e?.message ? String(e.message) : 'Не удалось загрузить журнал')
    } finally {
      setBusy(false)
    }
  }, [id])

  useEffect(() => {
    void reload()
  }, [reload])

  const visible = useMemo(() => filterLoyaltyJournalRows(rows, q), [rows, q])

  return { rows: visible, q, setQ, busy, error, reload, total: rows.length }
}
