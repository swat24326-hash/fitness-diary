import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Ticket } from 'lucide-react'
import {
  createMembershipFromSaleClip,
  listAwaitingSaleClipsForClient,
  listAwaitingSaleClipsForTrainer,
  saleClipAwaitingHours,
} from '../../lib/admin/saleClipLocalService.js'
import { useAuth } from '../../context/AuthContext'
import { useDebouncedStorageReload } from '../../lib/useDebouncedStorageReload'
import { SalesVisualAlert } from '../sales/SalesVisualAlert.jsx'

/**
 * Панель «создать по клипу» на планшете (клиент или домашний список тренера).
 */
export function TrainerSaleClipsPanel({ clientId, clubId, mode = 'client', onCreated }) {
  const { user } = useAuth()
  const [clips, setClips] = useState([])
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  const reload = useCallback(async () => {
    try {
      if (mode === 'trainer') {
        const tid = String(user?.id ?? '')
        setClips(await listAwaitingSaleClipsForTrainer(tid))
      } else {
        setClips(await listAwaitingSaleClipsForClient(clientId))
      }
    } catch {
      setClips([])
    }
  }, [mode, clientId, user?.id])

  useEffect(() => {
    void reload()
  }, [reload])

  useDebouncedStorageReload(() => {
    void reload()
  }, { debounceMs: 400 })

  const createFrom = async (clip) => {
    setBusyId(String(clip.id))
    setError('')
    setInfo('')
    try {
      const res = await createMembershipFromSaleClip({
        clip,
        clientId: clientId || clip.client_id,
        clubId: clubId || clip.club_id,
      })
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
  }

  if (!clips.length) {
    if (mode !== 'trainer') return null
    return (
      <section className="trainer-sale-clips trainer-sale-clips--empty" aria-label="Заявки на абонемент">
        <h3 className="trainer-sale-clips__title">
          <Ticket size={18} aria-hidden /> Заявки на абон
        </h3>
        <p className="muted">
          Сейчас заявок нет. Если менеджер только что отправил — нажмите Sync в шапке.
        </p>
      </section>
    )
  }

  return (
    <section className="trainer-sale-clips" aria-label="Заявки на абонемент">
      <h3 className="trainer-sale-clips__title">
        <Ticket size={18} aria-hidden /> Заявки: создать абонемент
      </h3>
      <p className="muted">
        Одна кнопка — поля из заявки менеджера. Обычная форма абона заявку <strong>не</strong> закрывает.
      </p>
      {error ? (
        <SalesVisualAlert level="error" title="Программа не создала абонемент">
          <p>{error}</p>
        </SalesVisualAlert>
      ) : null}
      {info ? (
        <SalesVisualAlert level="ok" title="Готово">
          <p>{info}</p>
        </SalesVisualAlert>
      ) : null}
      <ul className="trainer-sale-clips__list">
        {clips.map((c) => {
          const hours = saleClipAwaitingHours(c)
          const href = c.client_id ? `/trainer/clients/${c.client_id}?tab=memberships` : null
          return (
            <li key={c.id}>
              <div>
                <strong>{c.client_name}</strong>
                {c.card_number ? ` · №${c.card_number}` : ''}
                {c.membership_type_label ? ` · ${c.membership_type_label}` : ''}
                {c.total_trainings != null ? ` · ${c.total_trainings} тр.` : ''}
                <div className="muted">
                  Ждём вас{hours ? ` · уже ${hours} ч` : ''}
                  {href && mode === 'trainer' ? (
                    <>
                      {' · '}
                      <Link to={href}>открыть карточку</Link>
                    </>
                  ) : null}
                </div>
              </div>
              <button
                type="button"
                className="btn btn-primary btn-touch"
                disabled={Boolean(busyId) || !(clientId || c.client_id)}
                onClick={() => void createFrom(c)}
              >
                {busyId === String(c.id) ? '…' : 'Создать по заявке'}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
