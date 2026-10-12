import { useState } from 'react'
import { Download, Share, Smartphone } from 'lucide-react'

const TITLE = 'Значок на экран «Домой»'

/** Шаг установки — строка как у тренера: шаги iPhone раскрываются по «Как?», на экране остаётся место под абонемент. */
export function ClientInstallHint({ name, installer, onDone }) {
  const [open, setOpen] = useState(false)
  const canPrompt = installer.mode === 'prompt'

  return (
    <section className="client-install" aria-label={TITLE}>
      <div className="client-install__row">
        <h2 className="client-install__title">
          <Smartphone size={20} aria-hidden /> {TITLE}
        </h2>
        {canPrompt ? (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={async () => {
              if (await installer.install()) onDone()
            }}
          >
            <Download size={16} aria-hidden /> Установить
          </button>
        ) : (
          <button type="button" className="btn btn-secondary btn-sm" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            {open ? 'Свернуть' : 'Как?'}
          </button>
        )}
        <button type="button" className="btn btn-ghost btn-sm" onClick={onDone}>
          Готово
        </button>
      </div>
      {open && !canPrompt ? (
        <ol className="client-install__steps">
          <li>
            Нажмите <Share size={16} aria-label="Поделиться" /> внизу экрана
          </li>
          <li>Выберите «На экран „Домой“»</li>
          <li>Откройте значок «{name}»</li>
        </ol>
      ) : null}
    </section>
  )
}
