import { EllipsisVertical, Share } from 'lucide-react'

/** Шаги «значок на экран» вручную: iPhone — «Поделиться», Android без окна браузера — его меню. */
export function InstallSteps({ mode, name, className, lastStep = `Откройте значок «${name}»` }) {
  if (mode === 'ios') {
    return (
      <ol className={className}>
        <li>
          Нажмите <Share size={16} aria-label="Поделиться" /> внизу экрана
        </li>
        <li>Выберите «На экран „Домой“»</li>
        <li>{lastStep}</li>
      </ol>
    )
  }
  return (
    <ol className={className}>
      <li>
        Откройте меню браузера <EllipsisVertical size={16} aria-label="три точки" /> (в Яндекс Браузере — ☰)
      </li>
      <li>Выберите «Установить приложение» или «Добавить на главный экран»</li>
      <li>{lastStep}</li>
    </ol>
  )
}
