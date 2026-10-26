/**
 * Выбор при удалении слота: только эту или эту и похожие вперёд (после «повторять каждую неделю»).
 * @param {{
 *   count: number,
 *   busy?: boolean,
 *   onOne: () => void,
 *   onFollowing: () => void,
 *   onCancel: () => void,
 * }} props
 */
export function TrainerScheduleDeleteChoice({ count, busy = false, onOne, onFollowing, onCancel }) {
  const n = Math.max(1, Math.floor(Number(count) || 1))
  const multi = n > 1
  return (
    <div className="trainer-schedule-delete-choice" role="group" aria-label="Удалить запись">
      <p className="trainer-schedule-delete-choice__text">
        {multi
          ? `Ещё ${n - 1} похожих вперёд (то же время и клиент или заметка). Удалить только эту или все с этого дня?`
          : 'Удалить запись из расписания?'}
      </p>
      <div className="trainer-schedule-delete-choice__actions">
        {multi ? (
          <>
            <button type="button" className="btn btn-secondary btn-danger-outline" disabled={busy} onClick={onOne}>
              Только эту
            </button>
            <button type="button" className="btn btn-secondary btn-danger-outline" disabled={busy} onClick={onFollowing}>
              Эту и следующие · {n}
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-secondary btn-danger-outline" disabled={busy} onClick={onOne}>
            Удалить
          </button>
        )}
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={onCancel}>
          Отмена
        </button>
      </div>
    </div>
  )
}
