/**
 * Гантель на главной тренера: короткий гриф, крупные блины.
 */
export function TrainerHomeDumbbell({ className = '' }) {
  return (
    <svg
      className={className}
      viewBox="0 0 148 64"
      width="1em"
      height="1em"
      fill="currentColor"
      aria-hidden
    >
      {/* Левый замок */}
      <rect x="2" y="20" width="8" height="24" rx="3" />
      {/* Левые блины — крупнее */}
      <rect x="12" y="8" width="12" height="48" rx="3.5" />
      <rect x="26" y="0" width="14" height="64" rx="4" />
      <rect x="42" y="10" width="12" height="44" rx="3.5" />
      {/* Гриф — короткий */}
      <rect x="56" y="26" width="36" height="12" rx="3.5" />
      {/* Правые блины */}
      <rect x="94" y="10" width="12" height="44" rx="3.5" />
      <rect x="108" y="0" width="14" height="64" rx="4" />
      <rect x="124" y="8" width="12" height="48" rx="3.5" />
      {/* Правый замок */}
      <rect x="138" y="20" width="8" height="24" rx="3" />
    </svg>
  )
}
