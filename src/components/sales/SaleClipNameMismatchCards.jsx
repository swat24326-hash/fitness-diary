import { SalesVisualAlert } from './SalesVisualAlert.jsx'
import '../../styles/sale-clip-mismatch.css'

/**
 * @param {{ cardNumber?: string, phone?: string, trainerName?: string }} face
 */
function faceMeta(face) {
  const bits = []
  if (face.cardNumber) bits.push(`карта ${face.cardNumber}`)
  else if (face.phone) bits.push(face.phone)
  if (face.trainerName) bits.push(face.trainerName)
  return bits.join(' · ')
}

/**
 * Две карточки рядом, когда ФИО в базе и в клипе разные.
 * @param {{
 *   cards?: {
 *     onFile: { title: string, name: string, cardNumber?: string, phone?: string, trainerName?: string },
 *     inClip: { title: string, name: string, cardNumber?: string, phone?: string, trainerName?: string },
 *   } | null,
 *   line?: string,
 * }} props
 */
export function SaleClipNameMismatchCards({ cards, line }) {
  if (!cards?.onFile || !cards?.inClip) return null
  const pair = [cards.onFile, cards.inClip]
  return (
    <SalesVisualAlert level="warn" title={line || 'Фамилии не совпали'}>
      <div className="sale-clip-mismatch" role="group" aria-label="Карточка клуба и клип">
        {pair.map((face) => (
          <article key={face.title} className="sale-clip-mismatch__card">
            <p className="sale-clip-mismatch__label">{face.title}</p>
            <p className="sale-clip-mismatch__name">{face.name}</p>
            {faceMeta(face) ? <p className="sale-clip-mismatch__meta">{faceMeta(face)}</p> : null}
          </article>
        ))}
      </div>
    </SalesVisualAlert>
  )
}
