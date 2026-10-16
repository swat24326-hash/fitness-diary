import { useState } from 'react'
import { Camera, QrCode } from 'lucide-react'
import { LegalEntryLinks } from '../../components/legal/LegalEntryLinks.jsx'
import { APP_BRAND_NAME } from '../../lib/appBrand.js'
import { useClientApp } from './ClientAppContext.jsx'
import { ClientInstallHint } from './ClientInstallHint.jsx'
import { ClientMeStatus } from './ClientMeStatus.jsx'
import { ClientQrScanSheet } from './ClientQrScanSheet.jsx'

/**
 * Экран без сессии /me: (1) значок на «Домой», если ещё не установлен → (2) вход по QR камерой.
 * На iPhone сначала значок, потом QR — сессия сразу в приложении, без переноса из Safari.
 */
export function ClientSignInPanel({ error = '', onEntered }) {
  const { installer } = useClientApp()
  const [scanOpen, setScanOpen] = useState(false)
  const [installDismissed, setInstallDismissed] = useState(false)
  const needInstall = installer.mode !== 'none' && !installer.installed && !installDismissed
  const standalone = installer.installed

  return (
    <>
      <ClientMeStatus
        icon={QrCode}
        title="Вход в приложение клуба"
        hint={
          error ||
          (standalone
            ? 'Нажмите «Войти по QR» и наведите камеру на код в вашей карточке у тренера.'
            : 'На iPhone лучше сначала поставить значок, потом войти по QR — тогда вход останется в приложении.')
        }
      >
        {needInstall ? (
          <div className="client-signin__step">
            <span className="client-signin__step-n">1</span>
            <ClientInstallHint
              name={APP_BRAND_NAME}
              installer={installer}
              onDone={() => setInstallDismissed(true)}
            />
          </div>
        ) : null}

        <div className={`client-signin__step${needInstall ? '' : ' client-signin__step--solo'}`}>
          {needInstall ? <span className="client-signin__step-n">2</span> : null}
          <button type="button" className="btn btn-primary btn-touch client-signin__qr" onClick={() => setScanOpen(true)}>
            <Camera size={22} aria-hidden />
            Войти по QR
          </button>
        </div>

        <p className="client-signin__alt muted">Или откройте ссылку из сообщения клуба — камера телефона тоже подойдёт.</p>
        <LegalEntryLinks />
      </ClientMeStatus>

      {scanOpen ? (
        <ClientQrScanSheet
          onClose={() => setScanOpen(false)}
          onOk={() => {
            setScanOpen(false)
            onEntered()
          }}
        />
      ) : null}
    </>
  )
}
