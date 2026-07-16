import { buildPnkStepSegments } from '../../lib/pnk/pnkTrainerGlanceCore.js'

/**
 * Одна шкала ПНК: блоки шагов (заполненные / текущий / пустые).
 * @param {{ stepN?: number, stepTotal?: number, className?: string }} props
 */
export function PnkStepBlocks({ stepN, stepTotal = 5, className = '' }) {
  const { segments, stepN: n, total } = buildPnkStepSegments({ stepN, stepTotal })
  return (
    <div
      className={`pnk-step-blocks${className ? ` ${className}` : ''}`}
      role="img"
      aria-label={`Шаг ${n} из ${total}`}
    >
      <ol className="pnk-step-blocks__track" style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}>
        {segments.map((seg) => (
          <li
            key={seg.index}
            className={`pnk-step-blocks__seg pnk-step-blocks__seg--${seg.state}`}
            title={`Шаг ${seg.index}`}
          />
        ))}
      </ol>
    </div>
  )
}
