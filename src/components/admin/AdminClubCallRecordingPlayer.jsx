/**
 * Прослушивание записи звонка в журнале.
 * Скачивание — из меню плеера; отдельная кнопка только если воспроизведение не удалось.
 */
import { useState } from 'react'
import { Download } from 'lucide-react'

/**
 * @param {{ url: string }} props
 */
export function AdminClubCallRecordingPlayer({ url }) {
  const src = String(url ?? '').trim()
  const [failed, setFailed] = useState(false)
  if (!src) return null

  return (
    <div className="club-call-recording">
      <span className="club-call-recording__label">Запись</span>
      {failed ? (
        <div className="club-call-recording__fallback">
          <p className="muted club-call-recording__hint" role="status">
            В браузере не удалось воспроизвести.
          </p>
          <a
            className="btn btn-ghost btn-touch club-call-recording__download"
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            download
            title="Скачать запись"
            aria-label="Скачать запись"
          >
            <Download size={16} aria-hidden />
            <span>Скачать</span>
          </a>
        </div>
      ) : (
        <audio
          className="club-call-recording__audio"
          controls
          preload="none"
          src={src}
          onError={() => setFailed(true)}
        >
          Ваш браузер не поддерживает аудио.
        </audio>
      )}
    </div>
  )
}
