/**
 * @param {{ toast: { text: string, tone: string } | null }} props
 */
export function AppToast({ toast }) {
  if (!toast) return null
  return (
    <div className={`sync-feedback sync-feedback--${toast.tone} app-toast`} role="status" aria-live="polite">
      {toast.text}
    </div>
  )
}
