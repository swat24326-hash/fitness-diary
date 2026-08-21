import { useCallback, useEffect, useState } from 'react'
import {
  createMembershipFromSaleClip,
  listAwaitingSaleClipsForClient,
  listAwaitingSaleClipsForTrainer,
} from '../lib/admin/saleClipLocalService.js'
import { useDebouncedStorageReload } from '../lib/useDebouncedStorageReload'
import { suspiciousLowTotalConfirmMessageRu } from '../lib/membership/membershipTotalGuardCore.js'

/**
 * Очередь клип-заявок для планшета (главная или карточка клиента).
 * @param {{
 *   mode?: 'trainer'|'client',
 *   clientId?: string,
 *   clubId?: string,
 *   userId?: string,
 *   onCreated?: () => void,
 * }} opts
 */
export function useAwaitingSaleClips(opts = {}) {
  const mode = opts.mode === 'client' ? 'client' : 'trainer'
  const clientId = String(opts.clientId ?? '').trim()
  const clubId = String(opts.clubId ?? '').trim()
  const userId = String(opts.userId ?? '').trim()
  const onCreated = opts.onCreated

  const [clips, setClips] = useState([])
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  const reload = useCallback(async () => {
    try {
      if (mode === 'trainer') {
        if (!userId) {
          setClips([])
          return
        }
        setClips(await listAwaitingSaleClipsForTrainer(userId))
      } else {
        setClips(await listAwaitingSaleClipsForClient(clientId))
      }
    } catch {
      setClips([])
    }
  }, [mode, clientId, userId])

  useEffect(() => {
    void reload()
  }, [reload])

  useDebouncedStorageReload(() => {
    void reload()
  }, { debounceMs: 400 })

  const createFrom = useCallback(
    async (clip) => {
      setBusyId(String(clip.id))
      setError('')
      setInfo('')
      try {
        let res = await createMembershipFromSaleClip({
          clip,
          clientId: clientId || clip.client_id,
          clubId: clubId || clip.club_id,
        })
        if (!res.ok && res.code === 'confirm_low_total') {
          const ok = window.confirm(
            suspiciousLowTotalConfirmMessageRu({
              typeCode: String(clip.membership_type_label || '').trim(),
              totalTrainings: res.totalTrainings,
            }),
          )
          if (!ok) {
            setError('Создание отменено — исправьте число занятий в заявке у менеджера')
            return
          }
          res = await createMembershipFromSaleClip({
            clip,
            clientId: clientId || clip.client_id,
            clubId: clubId || clip.club_id,
            confirmedLowTotal: true,
          })
        }
        if (!res.ok) {
          setError(res.reason || 'Не удалось создать абон по клипу')
          return
        }
        setInfo(res.reason)
        await reload()
        onCreated?.()
      } catch (e) {
        setError(e?.message || 'Облако не приняло — клип остаётся «ждём планшет». Нажмите Sync позже.')
      } finally {
        setBusyId('')
      }
    },
    [clientId, clubId, onCreated, reload],
  )

  return { clips, busyId, error, info, reload, createFrom }
}
