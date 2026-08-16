/**
 * Универсальный виджет «длительность + запись» в журнале звонков.
 * Одна капсула: иконка волны (если есть смысл записи) + время.
 * Без слова «Запись».
 *
 * | tone    | файл | вид |
 * |---------|------|-----|
 * | bright  | да   | яркая капсула, клик → плеер |
 * | pale    | да   | бледная, клик → плеер (не дозвон) |
 * | empty   | нет  | тусклая иконка + время, без клика |
 * | none    | —    | только время (набор / сбой), без иконки |
 */
import { AudioLines } from 'lucide-react'

/**
 * @param {{
 *   durationLabel?: string,
 *   tone: 'bright' | 'pale' | 'empty' | 'none',
 *   title?: string,
 *   playable?: boolean,
 *   expanded?: boolean,
 *   onToggle?: () => void,
 * }} props
 */
export function AdminClubCallDurRecWidget({
  durationLabel = '',
  tone = 'none',
  title = '',
  playable = false,
  expanded = false,
  onToggle,
}) {
  const time = String(durationLabel ?? '').trim() || '—'
  const showIcon = tone !== 'none'
  const aria =
    title ||
    (playable
      ? `Запись, длительность ${time}`
      : showIcon
        ? `Длительность ${time}, записи нет`
        : `Длительность ${time}`)

  const className = [
    'club-call-dur-rec',
    `club-call-dur-rec--${tone}`,
    expanded ? 'club-call-dur-rec--open' : '',
    playable ? 'club-call-dur-rec--playable' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const body = (
    <>
      {showIcon ? <AudioLines className="club-call-dur-rec__icon" size={14} aria-hidden /> : null}
      <span className="club-call-dur-rec__time">{time}</span>
    </>
  )

  if (playable) {
    return (
      <button
        type="button"
        className={className}
        title={title || aria}
        aria-label={aria}
        aria-expanded={expanded}
        onClick={onToggle}
      >
        {body}
      </button>
    )
  }

  return (
    <span className={className} title={title || undefined} aria-label={aria}>
      {body}
    </span>
  )
}
