import { Download, Share, Smartphone, X } from 'lucide-react'

/**
 * «Установить на телефон»: Android — системное окно, iPhone — две строки инструкции.
 * @param {{ clubName: string, installer: ReturnType<typeof import('./useClientInstall.js').useClientInstall> }} props
 */
export function ClientInstallCard({ clubName, installer }) {
  const { mode, install, hide } = installer
  if (mode === 'none') return null
  const name = clubName || 'приложение клуба'
  return (
    <section className="client-me-card client-me-install">
      <h2 className="client-me-card__title">
        <Smartphone size={18} aria-hidden />
        Установить на телефон
        <button
          type="button"
          className="btn btn-ghost btn-icon-square btn-touch client-me-install__hide"
          onClick={hide}
          title="Скрыть"
          aria-label="Скрыть"
        >
          <X size={18} aria-hidden />
        </button>
      </h2>
      {mode === 'prompt' ? (
        <>
          <p className="client-me-muted">Значок «{name}» на главном экране — открывается одним касанием.</p>
          <button type="button" className="btn btn-primary btn-touch" onClick={() => void install()}>
            <Download size={18} aria-hidden />
            Установить
          </button>
        </>
      ) : (
        <ol className="client-me-install__steps">
          <li>
            Нажмите <Share size={16} aria-label="Поделиться" /> внизу экрана
          </li>
          <li>Выберите «На экран „Домой“» — появится значок «{name}»</li>
        </ol>
      )}
    </section>
  )
}
