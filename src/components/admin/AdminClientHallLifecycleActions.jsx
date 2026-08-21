import { useEffect, useState } from 'react'
import { Archive, RotateCcw } from 'lucide-react'
import { ClientArchiveReasonModal } from '../ClientArchiveReasonModal.jsx'
import {
  adminClientsCloseHallLabel,
  adminClientsCloseHallModalCopy,
  adminClientsReopenHallLabel,
  shouldOfferAdminCloseHall,
  shouldOfferAdminReopenHall,
} from '../../lib/admin/adminClientsHallLifecycleMenuCore.js'
import {
  closeClientHallWithReason,
  reopenClientHall,
} from '../../lib/clientHallLifecycleSyncService.js'
import { todayLocalIso } from '../../lib/dateRu.js'
import { dispatchLocalDataChanged } from '../../lib/dataAccess.js'
import { getDb } from '../../lib/localDb.js'

/**
 * Кнопки фазы 2 на карточке: закрыть / снова открыть текущий зал (ПЗ|ТЗ|АЗ).
 */
export function AdminClientHallLifecycleActions({
  client,
  memberships = [],
  lifecycleRows: lifecycleProp = null,
  hall = 'pz',
  onChanged,
}) {
  const [busy, setBusy] = useState(false)
  const [closeModal, setCloseModal] = useState(false)
  const [lifecycleRows, setLifecycleRows] = useState(() =>
    Array.isArray(lifecycleProp) ? lifecycleProp : [],
  )

  useEffect(() => {
    if (Array.isArray(lifecycleProp)) {
      setLifecycleRows(lifecycleProp)
      return undefined
    }
    const cid = String(client?.id ?? '').trim()
    if (!cid) return undefined
    let cancelled = false
    void (async () => {
      try {
        const db = await getDb()
        if (!db.objectStoreNames.contains('client_hall_lifecycle')) return
        let rows = []
        try {
          rows = await db.getAllFromIndex('client_hall_lifecycle', 'by_client_id', cid)
        } catch {
          const all = await db.getAll('client_hall_lifecycle')
          rows = (all ?? []).filter((r) => String(r?.client_id) === cid)
        }
        if (!cancelled) setLifecycleRows(rows ?? [])
      } catch {
        if (!cancelled) setLifecycleRows([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [client?.id, lifecycleProp])

  const today = todayLocalIso()
  const ctx = {
    clientsTab: hall === 'tz' || hall === 'az' ? hall : 'active',
    client,
    memberships,
    lifecycleRows,
    asOf: today,
  }
  const offerClose = shouldOfferAdminCloseHall(ctx)
  const offerReopen = shouldOfferAdminReopenHall(ctx)
  if (!offerClose && !offerReopen) return null

  const modalCopy = adminClientsCloseHallModalCopy(hall)

  const onCloseConfirm = async (payload) => {
    if (!client?.id) return
    setBusy(true)
    try {
      const { warn } = await closeClientHallWithReason(client, payload, { hall })
      if (warn) alert(warn)
      setCloseModal(false)
      dispatchLocalDataChanged({ reason: 'client-hall-lifecycle', clientId: client.id })
      onChanged?.()
    } catch (e) {
      alert(e?.message ?? 'Не удалось закрыть направление')
    } finally {
      setBusy(false)
    }
  }

  const onReopen = async () => {
    if (!client?.id) return
    setBusy(true)
    try {
      const { warn } = await reopenClientHall(client, { hall })
      if (warn) alert(warn)
      dispatchLocalDataChanged({ reason: 'client-hall-lifecycle', clientId: client.id })
      onChanged?.()
    } catch (e) {
      alert(e?.message ?? 'Не удалось открыть направление')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
        {offerClose ? (
          <button
            type="button"
            className="btn btn-secondary btn-touch"
            disabled={busy}
            onClick={() => setCloseModal(true)}
          >
            <Archive size={16} aria-hidden style={{ marginRight: 6 }} />
            {adminClientsCloseHallLabel(hall)}
          </button>
        ) : null}
        {offerReopen ? (
          <button
            type="button"
            className="btn btn-secondary btn-touch"
            disabled={busy}
            onClick={() => void onReopen()}
          >
            <RotateCcw size={16} aria-hidden style={{ marginRight: 6 }} />
            {adminClientsReopenHallLabel(hall)}
          </button>
        ) : null}
      </div>
      <ClientArchiveReasonModal
        open={closeModal}
        mode="enter"
        clientName={client?.name}
        client={client}
        busy={busy}
        enterTitle={modalCopy.enterTitle}
        enterConfirmLabel={modalCopy.enterConfirmLabel}
        enterHint={modalCopy.enterHint}
        onCancel={() => !busy && setCloseModal(false)}
        onConfirm={(payload) => void onCloseConfirm(payload)}
      />
    </>
  )
}
