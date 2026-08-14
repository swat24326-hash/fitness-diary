/**
 * Прослушивание записи звонка в журнале (+ запасное скачивание).
 */
import { useState } from 'react'

/**
 * @param {{ url: string }} props
 */
export function AdminClubCallRecordingPlayer({ url }) {
  const src = String(url ?? '').trim()
  const [failed, setFailed] = useState(false)
  if (!src) return null

  return (
    <div className="club-call-recording">
      <div className="club-call-recording__label">Запись разговора</div>
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
      <a
        className="club-call-recording__download"
        href={src}
        target="_blank"
        rel="noopener noreferrer"
        download
      >
        Скачать
      </a>
    </div>
  )
}
