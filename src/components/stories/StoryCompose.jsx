import { useState } from 'react'
import { X } from 'lucide-react'
import { STORY_CAPTION_MAX, STORY_MAX_FRAMES } from '../../lib/stories/storyClubCore.js'
import { prepareStoryPhoto } from '../../lib/stories/storyPhotoPrepare.js'

/**
 * Выкладка рекламы клуба: новость или акция, до 5 фото, срок до 7 дней.
 * @param {{ busy: boolean, error: string, onClose: () => void, onSubmit: (body: object) => void }} props
 */
export function StoryCompose({ busy, error, onClose, onSubmit }) {
  const [label, setLabel] = useState('promo')
  const [days, setDays] = useState(2)
  const [cta, setCta] = useState('none')
  const [frames, setFrames] = useState([])
  const [localError, setLocalError] = useState('')

  const addFiles = async (list) => {
    setLocalError('')
    const next = [...frames]
    for (const file of list) {
      if (next.length >= STORY_MAX_FRAMES) break
      try {
        const photo = await prepareStoryPhoto(file)
        next.push({ ...photo, caption: '' })
      } catch (e) {
        setLocalError(e?.message || 'Фото не открылось — попробуйте другое')
        break
      }
    }
    setFrames(next)
  }

  return (
    <div className="stories-compose" role="dialog" aria-modal="true" aria-label="Реклама клуба">
    <form
      className="stories-compose__card"
      onSubmit={(e) => {
        e.preventDefault()
        if (!frames.length) {
          setLocalError('Добавьте хотя бы одно фото')
          return
        }
        onSubmit({
          label,
          days: Number(days),
          cta,
          frames: frames.map(({ data, w, h, caption }) => ({ data, w, h, caption })),
        })
      }}
    >
      <h2>Реклама клуба</h2>
      <div className="stories-compose__row">
        <label>
          Вид
          <select value={label} onChange={(e) => setLabel(e.target.value)}>
            <option value="promo">Акция</option>
            <option value="news">Новость</option>
          </select>
        </label>
        <label>
          Срок, суток
          <select value={days} onChange={(e) => setDays(e.target.value)}>
            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Кнопка у клиента
        <select value={cta} onChange={(e) => setCta(e.target.value)}>
          <option value="none">Без кнопки</option>
          <option value="chat">Написать менеджеру</option>
          <option value="membership">Мой абонемент</option>
        </select>
      </label>
      <label className="btn btn-touch stories-compose__file">
        Фото ({frames.length}/{STORY_MAX_FRAMES})
        <input
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            void addFiles([...e.target.files])
            e.target.value = ''
          }}
        />
      </label>
      {frames.length ? (
        <ul className="stories-compose__photos">
          {frames.map((frame, i) => (
            <li key={i}>
              <img src={`data:image/jpeg;base64,${frame.data}`} alt="" />
              <button
                type="button"
                aria-label={`Убрать кадр ${i + 1}`}
                title={`Убрать кадр ${i + 1}`}
                onClick={() => setFrames(frames.filter((_, n) => n !== i))}
              >
                <X size={18} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {frames.map((frame, i) => (
        <label key={i}>
          Подпись к кадру {i + 1}
          <input
            value={frame.caption}
            maxLength={STORY_CAPTION_MAX}
            onChange={(e) => setFrames(frames.map((item, n) => (n === i ? { ...item, caption: e.target.value } : item)))}
          />
        </label>
      ))}
      {localError || error ? <p className="stories-compose__error">{localError || error}</p> : null}
      <span className="stories-compose__actions">
        <button type="button" className="btn btn-ghost btn-touch" onClick={onClose} disabled={busy}>
          Отмена
        </button>
        <button type="submit" className="btn btn-primary btn-touch" disabled={busy}>
          {busy ? 'Выкладываем…' : 'Опубликовать'}
        </button>
      </span>
    </form>
    </div>
  )
}
