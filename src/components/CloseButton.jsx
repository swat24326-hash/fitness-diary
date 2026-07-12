import { X } from 'lucide-react'

/**
 * Единая кнопка закрытия модалок и панелей — крестик.
 * @param {{
 *   onClick: () => void,
 *   className?: string,
 *   size?: number,
 *   label?: string,
 *   disabled?: boolean,
 *   touch?: boolean,
 *   sm?: boolean,
 * }} props
 */
export function CloseButton({
  onClick,
  className = '',
  size = 18,
  label = 'Закрыть',
  disabled = false,
  touch = false,
  sm = false,
  ...rest
}) {
  const classes = [
    'btn',
    'btn-ghost',
    'btn-icon-square',
    'modal-close-btn',
    touch ? 'btn-touch' : '',
    sm ? 'btn-sm' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button
      type="button"
      className={classes}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      {...rest}
    >
      <X size={size} aria-hidden />
    </button>
  )
}
