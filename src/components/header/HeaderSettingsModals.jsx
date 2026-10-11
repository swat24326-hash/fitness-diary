import { CoachPhoneQrModal } from '../coach/CoachPhoneQrModal.jsx'

/** Окна из «Настроек» бургера: живут вне меню — меню закрывается, окно остаётся. */
export function HeaderSettingsModals({ which, onClose }) {
  return <CoachPhoneQrModal open={which === 'phone-qr'} onClose={onClose} />
}
