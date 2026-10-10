/**
 * Гирька — персонаж стикеров клуба (viewBox 0 0 120 120): тело-гиря, лицо, руки, ноги.
 * Позы и эмоции — параметрами, реквизит — в chatStickerShapes.jsx. Цвета — классы .stk-* (chat-stickers.css).
 */

const EYES = {
  open: (
    <>
      <ellipse className="stk-ink-fill" cx="49" cy="70" rx="4.2" ry="5.6" />
      <ellipse className="stk-ink-fill" cx="71" cy="70" rx="4.2" ry="5.6" />
      <circle className="stk-eye-shine" cx="50.6" cy="67.8" r="1.6" />
      <circle className="stk-eye-shine" cx="72.6" cy="67.8" r="1.6" />
    </>
  ),
  happy: <path className="stk-stroke-ink" d="M44 72q5-7 10 0M66 72q5-7 10 0" />,
  wink: (
    <>
      <ellipse className="stk-ink-fill" cx="49" cy="70" rx="4.2" ry="5.6" />
      <circle className="stk-eye-shine" cx="50.6" cy="67.8" r="1.6" />
      <path className="stk-stroke-ink" d="M66 71q5-6 10 0" />
    </>
  ),
  star: (
    <path
      className="stk-ink-fill"
      d="M49 63q1 6 7 7q-6 1-7 7q-1-6-7-7q6-1 7-7zM71 63q1 6 7 7q-6 1-7 7q-1-6-7-7q6-1 7-7z"
    />
  ),
  tired: <path className="stk-stroke-ink" d="M43 69q6 4 11 0M66 69q5 4 11 0M45 75h6M68 75h6" />,
  sad: (
    <>
      <ellipse className="stk-ink-fill" cx="49" cy="71" rx="4" ry="5" />
      <ellipse className="stk-ink-fill" cx="71" cy="71" rx="4" ry="5" />
      <path className="stk-stroke-ink" d="M42 63l10-3M78 63l-10-3" />
    </>
  ),
  fierce: (
    <>
      <ellipse className="stk-ink-fill" cx="49" cy="71" rx="4.2" ry="5" />
      <ellipse className="stk-ink-fill" cx="71" cy="71" rx="4.2" ry="5" />
      <circle className="stk-eye-shine" cx="50.4" cy="69" r="1.5" />
      <circle className="stk-eye-shine" cx="72.4" cy="69" r="1.5" />
      <path className="stk-stroke-ink" d="M42 61l11 5M78 61l-11 5" />
    </>
  ),
}

const MOUTH = {
  smile: <path className="stk-stroke-ink" d="M52 81q8 8 16 0" />,
  grin: <path className="stk-ink-fill" d="M49 79h22q-1 13-11 13t-11-13z" />,
  o: <ellipse className="stk-ink-fill" cx="60" cy="85" rx="4" ry="5" />,
  sad: <path className="stk-stroke-ink" d="M52 88q8-7 16 0" />,
  wavy: <path className="stk-stroke-ink" d="M49 85q2.75-3 5.5 0t5.5 0t5.5 0t5.5 0" />,
}

/** [путь руки, кисть x, кисть y, класс анимации] — левая и правая. */
const ARMS = {
  down: [['M33 80q-9 6-11 15', 22, 96], ['M87 80q9 6 11 15', 98, 96]],
  up: [['M33 76q-12-6-15-20', 18, 55], ['M87 76q12-6 15-20', 102, 55]],
  wave: [['M33 80q-9 6-11 15', 22, 96], ['M87 78q13-4 16-18', 103, 59, 'stk-a-wave']],
  hold: [['M33 84q6 12 18 12', 51, 96], ['M87 84q-6 12-18 12', 69, 96]],
  lift: [['M32 72q-12-18 2-42', 34, 30], ['M88 72q12-18-2-42', 86, 30]],
  flex: [['M33 80q-9 6-11 15', 22, 96], ['M87 82q16 2 16-16', 103, 64, 'stk-a-flex']],
  thumb: [['M33 80q-9 6-11 15', 22, 96], ['M87 80q12 0 15-10', 102, 69]],
  shrug: [['M33 80q-12-2-16-12', 17, 67], ['M87 80q12-2 16-12', 103, 67]],
  drink: [['M33 80q-9 6-11 15', 22, 96], ['M87 84q8-6 1-17', 88, 67]],
}

const FEET = {
  stand: (
    <>
      <ellipse className="stk-foot" cx="48" cy="106" rx="8" ry="4.5" />
      <ellipse className="stk-foot" cx="72" cy="106" rx="8" ry="4.5" />
    </>
  ),
  run: (
    <>
      <ellipse className="stk-foot" cx="40" cy="103" rx="8" ry="4.5" transform="rotate(-25 40 103)" />
      <ellipse className="stk-foot" cx="78" cy="108" rx="8" ry="4.5" transform="rotate(15 78 108)" />
    </>
  ),
}

function Arm({ d, x, y, anim }) {
  return (
    <g className={anim}>
      <path className="stk-limb" d={d} />
      <circle className="stk-hand" cx={x} cy={y} r="5.5" />
    </g>
  )
}

/**
 * @param {{ a: string, eyes?: keyof EYES, mouth?: keyof MOUTH, arms?: keyof ARMS, feet?: keyof FEET,
 *   blush?: boolean, anim?: string, behind?: import('react').ReactNode, children?: import('react').ReactNode }} p
 */
export function StickerKettle({ a, eyes = 'open', mouth = 'smile', arms = 'down', feet = 'stand', blush = false, anim = '', behind = null, children = null }) {
  return (
    <g className={`stk-kettle ${anim}`}>
      {behind}
      {FEET[feet]}
      <path className="stk-handle" d="M40 62C32 26 88 26 80 62" />
      <circle fill={a} cx="60" cy="76" r="30" />
      <ellipse className="stk-body-shine" cx="45" cy="60" rx="7" ry="4" transform="rotate(-35 45 60)" />
      {EYES[eyes]}
      {MOUTH[mouth]}
      {blush ? (
        <>
          <ellipse className="stk-blush" cx="41" cy="79" rx="5" ry="3" />
          <ellipse className="stk-blush" cx="79" cy="79" rx="5" ry="3" />
        </>
      ) : null}
      {ARMS[arms].map(([d, x, y, anim2], i) => (
        <Arm key={i} d={d} x={x} y={y} anim={anim2} />
      ))}
      {children}
    </g>
  )
}

export function Spark({ x, y, s = 6, anim = 'stk-a-twinkle' }) {
  return (
    <path
      className={`stk-spark ${anim}`}
      d={`M${x} ${y - s}Q${x} ${y} ${x + s} ${y}Q${x} ${y} ${x} ${y + s}Q${x} ${y} ${x - s} ${y}Q${x} ${y} ${x} ${y - s}Z`}
    />
  )
}

export function Drop({ x, y, s = 1, anim = '' }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path className={`stk-drop ${anim}`} d="M0 -9C3 -3 6 0 6 3.5a6 6 0 0 1-12 0C-6 0-3-3 0-9z" />
    </g>
  )
}
