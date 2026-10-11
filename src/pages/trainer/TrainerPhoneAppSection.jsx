import { useState } from 'react'
import { Smartphone } from 'lucide-react'
import { CoachPhoneQrModal } from '../../components/coach/CoachPhoneQrModal.jsx'

/** «Профиль» тренера: подключить свой телефон — ответы клиентам и план дня вне зала. */
export function TrainerPhoneAppSection() {
  const [open, setOpen] = useState(false)
  return (
    <section className="card">
      <h2 className="section-title" style={{ marginBottom: 6 }}>
        Приложение на телефоне
      </h2>
      <p className="section-sub" style={{ marginTop: 0 }}>
        Сообщения клиентов и расписание на сегодня и завтра — на вашем телефоне.
      </p>
      <button type="button" className="btn btn-primary btn-touch" onClick={() => setOpen(true)}>
        <Smartphone size={18} aria-hidden /> QR для телефона
      </button>
      <CoachPhoneQrModal open={open} onClose={() => setOpen(false)} />
    </section>
  )
}
