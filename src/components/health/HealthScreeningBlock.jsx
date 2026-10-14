/** Блок анкеты: заголовок, «3 из 14», «Всё нет». */
export function HealthScreeningBlock({ title, note, progress, onAllNo, disabled, children }) {
  const left = progress ? progress.total - progress.done : 0
  return (
    <fieldset className="hscr-block">
      <legend className="hscr-block__head">
        <span className="hscr-block__title">{title}</span>
        {progress ? (
          <span className={`hscr-block__progress${left === 0 ? ' hscr-block__progress--done' : ''}`}>
            {progress.done} из {progress.total}
          </span>
        ) : null}
      </legend>
      {note ? <p className="hscr-block__note">{note}</p> : null}
      {onAllNo && left > 0 ? (
        <button type="button" className="btn btn-ghost btn-sm btn-touch hscr-block__allno" disabled={disabled} onClick={onAllNo}>
          Остальное — нет
        </button>
      ) : null}
      <div className="hscr-block__list">{children}</div>
    </fieldset>
  )
}
