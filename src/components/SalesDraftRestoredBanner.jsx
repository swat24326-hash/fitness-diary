/**
 * Баннер: восстановлен локальный черновик плана/отчёта + сброс.
 *
 * @param {{
 *   text: string,
 *   busy?: boolean,
 *   onDiscard: () => void,
 * }} props
 */
export function SalesDraftRestoredBanner({ text, busy = false, onDiscard }) {
  const msg = String(text ?? '').trim()
  if (!msg) return null
  return (
    <div className="sync-feedback sync-feedback--warn sales-draft-restored" role="status">
      <p className="sales-draft-restored__text">{msg}</p>
      <button
        type="button"
        className="btn btn-ghost btn-touch"
        disabled={busy}
        onClick={() => onDiscard?.()}
      >
        Отменить черновик
      </button>
    </div>
  )
}
