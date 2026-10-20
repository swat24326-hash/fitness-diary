/**
 * Гантель на главной тренера: заметный гриф, крупные блины.
 */
export function TrainerHomeDumbbell({ className = '' }) {
  return (
    <svg
      className={className}
      viewBox="0 0 148 72"
      width="1em"
      height="1em"
      fill="currentColor"
      aria-hidden
    >
      {/* Левый замок */}
      <rect x="2" y="24" width="7" height="24" rx="2.5" />
      {/* Левые блины */}
      <rect x="10" y="12" width="14" height="48" rx="4" />
      <rect x="25" y="0" width="16" height="72" rx="5" />
      <rect x="42" y="14" width="14" height="44" rx="4" />
      {/* Гриф — длиннее, чем у «квадратной» версии */}
      <rect x="58" y="28" width="32" height="16" rx="4" />
      {/* Правые блины */}
      <rect x="92" y="14" width="14" height="44" rx="4" />
      <rect x="107" y="0" width="16" height="72" rx="5" />
      <rect x="124" y="12" width="14" height="48" rx="4" />
      {/* Правый замок */}
      <rect x="139" y="24" width="7" height="24" rx="2.5" />
    </svg>
  )
}
