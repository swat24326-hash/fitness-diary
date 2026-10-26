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
  const followingExtra = multi ? n - 1 : 0
  return (
    <div className="trainer-schedule-delete-choice" role="group" aria-label="Удалить запись">
      <p className="trainer-schedule-delete-choice__text">
        {multi
          ? `Удалить эту и ещё ${followingExtra} таких же вперёд?`
          : 'Удалить запись из расписания?'}
      </p>
      {multi ? (
        <p className="trainer-schedule-delete-choice__meta">То же время и клиент или заметка.</p>
      ) : null}
      <div className="trainer-schedule-delete-choice__actions">
        {multi ? (
          <>
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={onOne}>
              Только эту
            </button>
            <button type="button" className="btn btn-secondary btn-danger-outline" disabled={busy} onClick={onFollowing}>
              Эту и следующие
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
