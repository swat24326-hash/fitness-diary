import { SalesVisualAlert } from './SalesVisualAlert.jsx'
import { SaleClipNameMismatchCards } from './SaleClipNameMismatchCards.jsx'

/**
 * Вопрос перед сменой тренера карточки. Имена — как в списке клуба, без склонения.
 * @param {{ clientTrainerName?: string, selectedTrainerName?: string } | null | undefined} preview
 */
export function saleClipTransferConfirmMessage(preview) {
  const fromName = String(preview?.clientTrainerName ?? '').trim()
  const toName = String(preview?.selectedTrainerName ?? '').trim()
  const from = fromName ? `тренера ${fromName}` : 'другого тренера'
  const to = toName ? `тренеру ${toName}` : 'выбранному тренеру'
  return `Этот клиент сейчас у ${from}. Перевести к ${to}?`
}

/**
 * До кнопки: кого нашли. Две карточки — только если фамилии разъехались.
 * @param {{ preview?: {
 *   line?: string,
 *   cards?: object|null,
 *   needTransferConfirm?: boolean,
 *   clientTrainerName?: string,
 *   selectedTrainerName?: string,
 * } | null }} props
 */
export function SaleClipMatchPreview({ preview }) {
  if (!preview?.line && !preview?.cards) return null
  const transfer = preview.needTransferConfirm ? saleClipTransferConfirmMessage(preview) : ''
  const notFound = /не найден/i.test(String(preview.line ?? ''))
  return (
    <>
      {preview.cards ? <SaleClipNameMismatchCards cards={preview.cards} line={preview.line} /> : null}
      {!preview.cards && preview.line ? (
        <SalesVisualAlert level={transfer ? 'warn' : notFound ? 'info' : 'ok'} title={preview.line}>
          {transfer ? <p>{transfer}</p> : null}
        </SalesVisualAlert>
      ) : null}
      {preview.cards && transfer ? (
        <SalesVisualAlert level="warn" title="Тренер карточки другой">
          <p>{transfer}</p>
        </SalesVisualAlert>
      ) : null}
    </>
  )
}
