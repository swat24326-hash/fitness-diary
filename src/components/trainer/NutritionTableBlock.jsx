/**
 * Таблица рациона: на планшете — скролл, на узком телефоне — карточки строк.
 */
export function NutritionTableBlock({
  rows,
  footer,
  portionHeader = 'Порция',
  readOnly = true,
  planUnsaved = false,
  mealSlot,
  onItemGramsChange,
  tableClassName = '',
}) {
  const canEdit = !readOnly && planUnsaved && mealSlot && onItemGramsChange

  return (
    <>
      <div className="nutrition-table-scroll">
        <table className={`nutrition-table ${tableClassName}`.trim()}>
          <thead>
            <tr>
              <th>Продукт</th>
              <th>{portionHeader}</th>
              <th>ккал</th>
              <th>Б</th>
              <th>Ж</th>
              <th>У</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <td>{row.label}</td>
                <td>
                  {canEdit ? (
                    <label className="nutrition-grams-edit">
                      <input
                        className="input nutrition-grams-input"
                        type="number"
                        min={5}
                        step={5}
                        inputMode="decimal"
                        defaultValue={row.grams ?? ''}
                        key={`${mealSlot}-${row.productId}-${row.grams}`}
                        onBlur={(e) => onItemGramsChange(mealSlot, row.productId, e.target.value)}
                      />
                      <span className="muted">г</span>
                    </label>
                  ) : (
                    row.portionLabel
                  )}
                </td>
                <td>{row.kcal}</td>
                <td>{row.proteinG}</td>
                <td>{row.fatG}</td>
                <td>{row.carbsG}</td>
              </tr>
            ))}
          </tbody>
          {footer ? (
            <tfoot>
              <tr>
                <td colSpan={2}>
                  <strong>{footer.label}</strong>
                </td>
                <td>{footer.kcal}</td>
                <td>{footer.proteinG}</td>
                <td>{footer.fatG}</td>
                <td>{footer.carbsG}</td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>

      <div className="nutrition-item-cards">
        {rows.map((row) => (
          <article key={`card-${row.key}`} className="nutrition-item-card">
            <div className="nutrition-item-card__name">{row.label}</div>
            <dl className="nutrition-item-card__grid">
              <div className="nutrition-item-card__cell">
                <dt>{portionHeader}</dt>
                <dd>
                  {canEdit ? (
                    <label className="nutrition-grams-edit">
                      <input
                        className="input nutrition-grams-input"
                        type="number"
                        min={5}
                        step={5}
                        inputMode="decimal"
                        defaultValue={row.grams ?? ''}
                        key={`card-${mealSlot}-${row.productId}-${row.grams}`}
                        onBlur={(e) => onItemGramsChange(mealSlot, row.productId, e.target.value)}
                      />
                      <span className="muted">г</span>
                    </label>
                  ) : (
                    row.portionLabel
                  )}
                </dd>
              </div>
              <div className="nutrition-item-card__cell">
                <dt>ккал</dt>
                <dd>{row.kcal}</dd>
              </div>
              <div className="nutrition-item-card__cell">
                <dt>Б</dt>
                <dd>{row.proteinG}</dd>
              </div>
              <div className="nutrition-item-card__cell">
                <dt>Ж</dt>
                <dd>{row.fatG}</dd>
              </div>
              <div className="nutrition-item-card__cell">
                <dt>У</dt>
                <dd>{row.carbsG}</dd>
              </div>
            </dl>
          </article>
        ))}
        {footer ? (
          <article className="nutrition-item-card nutrition-item-card--subtotal">
            <div className="nutrition-item-card__name">{footer.label}</div>
            <dl className="nutrition-item-card__grid">
              <div className="nutrition-item-card__cell nutrition-item-card__cell--wide">
                <dt>{portionHeader}</dt>
                <dd>—</dd>
              </div>
              <div className="nutrition-item-card__cell">
                <dt>ккал</dt>
                <dd>{footer.kcal}</dd>
              </div>
              <div className="nutrition-item-card__cell">
                <dt>Б</dt>
                <dd>{footer.proteinG}</dd>
              </div>
              <div className="nutrition-item-card__cell">
                <dt>Ж</dt>
                <dd>{footer.fatG}</dd>
              </div>
              <div className="nutrition-item-card__cell">
                <dt>У</dt>
                <dd>{footer.carbsG}</dd>
              </div>
            </dl>
          </article>
        ) : null}
      </div>
    </>
  )
}
