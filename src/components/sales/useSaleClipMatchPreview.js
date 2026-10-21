import { useEffect, useState } from 'react'
import { buildSaleClipMatchPreview } from '../../lib/admin/saleClipMatchPreviewCore.js'
import { matchSaleClipClient } from '../../lib/admin/saleClipService.js'

/**
 * До кнопки: кого нашли по карте/телефону и не разъехались ли ФИО.
 * Ошибка поиска не блокирует отправку заявки.
 * @param {{
 *   clubId?: string,
 *   cardNumber?: string,
 *   phone?: string,
 *   clipName?: string,
 *   selectedTrainerId?: string,
 *   trainerNameById?: Map<string, string>,
 * }} input
 */
export function useSaleClipMatchPreview({
  clubId,
  cardNumber,
  phone,
  clipName,
  selectedTrainerId,
  trainerNameById,
}) {
  const [preview, setPreview] = useState(null)

  useEffect(() => {
    const card = String(cardNumber ?? '').trim()
    const tel = String(phone ?? '').trim()
    if (!clubId || (!card && !tel)) {
      setPreview(null)
      return undefined
    }

    let cancelled = false
    const timer = setTimeout(() => {
      const trainerName = (id) => {
        const key = String(id ?? '').trim()
        if (!key) return ''
        return trainerNameById?.get(key) || ''
      }
      matchSaleClipClient({ clubId, cardNumber: card, phone: tel })
        .then((data) => {
          if (cancelled) return
          const client = data?.match?.status === 'one' ? data.match.client : null
          const selectedTrainerName = trainerName(selectedTrainerId)
          const clientTrainerName = trainerName(client?.trainer_id)
          setPreview({
            ...buildSaleClipMatchPreview({
              client,
              clipName,
              cardNumber: card,
              clipPhone: tel,
              selectedTrainerId,
              selectedTrainerName,
              clientTrainerName,
            }),
            selectedTrainerName,
            clientTrainerName,
          })
        })
        .catch(() => {
          if (!cancelled) setPreview(null)
        })
    }, 400)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [clubId, cardNumber, phone, clipName, selectedTrainerId, trainerNameById])

  return preview
}
