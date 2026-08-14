/**
 * Прослушивание записи звонка в журнале (+ запасное скачивание).
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
      <div className="club-call-recording__head">
        <span className="club-call-recording__label">Запись</span>
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
      {failed ? (
        <p className="muted club-call-recording__hint" role="status">
          В браузере не удалось воспроизвести — скачайте файл.
        </p>
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
