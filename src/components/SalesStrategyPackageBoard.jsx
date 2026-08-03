import { formatRub } from '../lib/admin/salesReportCore.js'
import { buildStrategyPackageBoard } from '../lib/admin/salesStrategyPackageBoardCore.js'

/**
 * Универсальная доска пакета после «Посчитать».
 *
 * @param {{
 *   renewalsSuggest?: object|null,
 *   topUpPack?: object|null,
 * }} props
 */
export function SalesStrategyPackageBoard({ renewalsSuggest = null, topUpPack = null }) {
  const board = buildStrategyPackageBoard({ renewalsSuggest, topUpPack })
  if (!board.ok) return null

  const piecesLabel = new Intl.NumberFormat('ru-RU').format(board.pieces)

  return (
    <div className="sales-strategy-board" role="region" aria-label="Сводка пакета Стратегии">
      <div className="sales-strategy-board__hero">
        <div className="sales-strategy-board__hero-cell">
          <span className="sales-strategy-board__label">В пакет</span>
          <strong className="sales-strategy-board__value sales-strategy-board__value--lg">
            {piecesLabel} шт.
          </strong>
        </div>
        <div className="sales-strategy-board__hero-cell">
          <span className="sales-strategy-board__label">Залы НК · ДК · УК</span>
          <strong className="sales-strategy-board__value sales-strategy-board__value--lg">
            {formatRub(board.hallsRub)}
          </strong>
        </div>
      </div>

      <div className="sales-strategy-board__grid">
        <div className="sales-strategy-board__cell">
          <span className="sales-strategy-board__label">Доп. продажи</span>
          <strong className="sales-strategy-board__value">{formatRub(board.planExtraRub)}</strong>
          <span className="muted sales-strategy-board__hint">
            {board.planExtraRub > 0
              ? `${board.planExtraPct}% от ${formatRub(board.prevExtraRub)} за прошлый месяц`
              : 'в прошлом месяце доп. не было'}
          </span>
        </div>
        <div className="sales-strategy-board__cell">
          <span className="sales-strategy-board__label">Уровень 3</span>
          <strong className="sales-strategy-board__value">
            {board.level3Rub > 0 ? formatRub(board.level3Rub) : 'не задан'}
          </strong>
          <span className="muted sales-strategy-board__hint">
            {board.hallsBudgetRub > 0 && board.level3Rub > 0
              ? `залы до ${formatRub(board.hallsBudgetRub)} (ур. 3 − доп.)`
              : 'бюджет пакета'}
          </span>
        </div>
        <div className="sales-strategy-board__cell sales-strategy-board__cell--accent">
          <span className="sales-strategy-board__label">Итого с доп.</span>
          <strong className="sales-strategy-board__value">
            {formatRub(board.totalWithExtraRub)}
          </strong>
          <span className="muted sales-strategy-board__hint">
            {board.mode === 'full' && board.level3Rub > 0
              ? board.fittedToBudget
                ? 'пакет залов в допуске к цели'
                : 'пакет залов вне допуска — см. ниже'
              : board.mode === 'full'
                ? 'ур. 3 не задан — ориентир без потолка'
                : 'только ДК, полного пакета нет'}
          </span>
        </div>
      </div>
    </div>
  )
}
