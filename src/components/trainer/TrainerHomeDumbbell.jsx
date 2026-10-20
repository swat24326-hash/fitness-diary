/**
 * Гантель на главной тренера: короткий толстый гриф, массивные блины.
 */
export function TrainerHomeDumbbell({ className = '' }) {
  return (
    <svg
      className={className}
      viewBox="0 0 128 72"
      width="1em"
      height="1em"
      fill="currentColor"
      aria-hidden
    >
      {/* Левый замок */}
      <rect x="1" y="24" width="7" height="24" rx="2.5" />
      {/* Левые блины — крупные */}
      <rect x="9" y="12" width="14" height="48" rx="4" />
      <rect x="24" y="0" width="16" height="72" rx="5" />
      <rect x="41" y="14" width="14" height="44" rx="4" />
      {/* Гриф — короткий и толстый */}
      <rect x="56" y="28" width="16" height="16" rx="4" />
      {/* Правые блины */}
      <rect x="73" y="14" width="14" height="44" rx="4" />
      <rect x="88" y="0" width="16" height="72" rx="5" />
      <rect x="105" y="12" width="14" height="48" rx="4" />
      {/* Правый замок */}
      <rect x="120" y="24" width="7" height="24" rx="2.5" />
    </svg>
  )
}
