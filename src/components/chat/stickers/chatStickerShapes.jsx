/**
 * Сцены стикеров с Гирькой (viewBox 0 0 120 120): поза, эмоция, реквизит и анимация.
 * a — градиент акцента из рамки ChatSticker; анимации .stk-a-* — в styles/chat-stickers.css.
 */
import { Drop, Spark, StickerKettle } from './StickerKettle.jsx'

function MiniCalendar({ x, y }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect className="stk-face stk-edge-thin" x="0" y="0" width="28" height="26" rx="6" />
      <path className="stk-accent" d="M0 6a6 6 0 0 1 6-6h16a6 6 0 0 1 6 6v3H0z" />
    </g>
  )
}

export const STICKER_SHAPES = {
  late: ({ a }) => (
    <StickerKettle
      a={a}
      eyes="open"
      mouth="o"
      feet="run"
      anim="stk-a-run"
      behind={<path className="stk-line" d="M100 60h14M104 74h12M100 88h14" />}
    >
      <g className="stk-a-tilt">
        <circle className="stk-face stk-edge-thin" cx="22" cy="30" r="15" />
        <path className="stk-stroke-light" d="M22 30v-9M22 30l6 4" />
      </g>
      <Drop x={92} y={46} anim="stk-a-drip" />
    </StickerKettle>
  ),
  'cant-come': ({ a }) => (
    <StickerKettle a={a} eyes="sad" mouth="sad" anim="stk-a-sway">
      <Drop x={44} y={84} s={0.7} anim="stk-a-drip" />
      <MiniCalendar x={88} y={10} />
      <path className="stk-stroke-danger" d="M96 22l12 11M108 22L96 33" />
    </StickerKettle>
  ),
  coming: ({ a }) => (
    <StickerKettle a={a} eyes="happy" mouth="grin" arms="thumb" blush anim="stk-a-hop">
      <rect className="stk-hand" x="99" y="55" width="7" height="12" rx="3.5" />
      <Spark x={20} y={30} s={7} />
      <Spark x={100} y={26} />
    </StickerKettle>
  ),
  reschedule: ({ a }) => (
    <StickerKettle a={a} eyes="open" mouth="o" arms="shrug" anim="stk-a-tilt">
      <MiniCalendar x={86} y={6} />
      <path className="stk-stroke-accent" d="M93 22a7 7 0 0 1 12-3M105 15v4h-4M107 25a7 7 0 0 1-12 3M95 32v-4h4" />
    </StickerKettle>
  ),
  'see-you': ({ a }) => (
    <StickerKettle a={a} eyes="happy" mouth="smile" arms="wave" blush>
      <path className="stk-stroke-light" d="M10 96h24" />
      <rect className="stk-accent" x="8" y="89" width="6" height="14" rx="2" />
      <rect className="stk-accent" x="30" y="89" width="6" height="14" rx="2" />
      <Spark x={104} y={34} s={5} />
    </StickerKettle>
  ),
  thanks: ({ a }) => (
    <StickerKettle a={a} eyes="happy" mouth="smile" arms="hold" blush>
      <g className="stk-a-pulse">
        <path
          className="stk-heart"
          transform="translate(60 98) scale(0.42) translate(-60 -64)"
          d="M60 94C22 68 22 38 42 34c9-2 15 3 18 10 3-7 9-12 18-10 20 4 20 34-18 60z"
        />
      </g>
      <Spark x={18} y={40} />
      <Spark x={102} y={36} s={5} />
    </StickerKettle>
  ),
  record: ({ a }) => (
    <StickerKettle a={a} eyes="star" mouth="grin" arms="lift" anim="stk-a-hop">
      <g className="stk-a-tilt">
        <path className="stk-line stk-thin" d="M42 8h-6a8 8 0 0 0 8 11M78 8h6a8 8 0 0 1-8 11" />
        <path fill={a} className="stk-edge-thin" d="M42 2h36v10a18 18 0 0 1-36 0z" />
        <path className="stk-ink-fill" d="M60 7l2.5 5 5.5.7-4 3.8 1 5.5-5-2.7-5 2.7 1-5.5-4-3.8 5.5-.7z" />
        <rect className="stk-accent" x="56" y="29" width="8" height="5" />
        <rect fill={a} className="stk-edge-thin" x="47" y="33" width="26" height="6" rx="2" />
      </g>
      <Spark x={16} y={14} s={7} />
      <Spark x={104} y={12} />
    </StickerKettle>
  ),
  fire: ({ a }) => (
    <StickerKettle
      a={a}
      eyes="fierce"
      mouth="grin"
      arms="up"
      behind={
        <g className="stk-a-flicker">
          <path
            className="stk-flame"
            d="M60 2C66 20 84 28 88 46C92 40 92 34 90 28C102 42 108 58 104 76A44 40 0 0 1 16 76C12 62 20 50 28 42C28 50 32 56 36 58C34 38 46 18 60 2Z"
          />
          <path className="stk-flame-core" d="M60 22C64 34 76 40 78 52A18 16 0 0 1 42 52C44 42 56 36 60 22Z" />
        </g>
      }
    />
  ),
  done: ({ a }) => (
    <StickerKettle a={a} eyes="wink" mouth="smile" arms="flex" blush>
      <circle className="stk-hand" cx="96" cy="76" r="6" />
      <Spark x={110} y={46} s={5} />
      <Spark x={18} y={44} />
    </StickerKettle>
  ),
  tired: ({ a }) => (
    <StickerKettle a={a} eyes="tired" mouth="wavy" arms="thumb" anim="stk-a-pant">
      <rect className="stk-hand" x="99" y="55" width="7" height="12" rx="3.5" />
      <Drop x={30} y={50} anim="stk-a-drip" />
      <Drop x={86} y={42} s={0.8} anim="stk-a-drip stk-delay" />
    </StickerKettle>
  ),
  water: ({ a }) => (
    <StickerKettle a={a} eyes="happy" mouth="o" arms="drink" blush>
      <g transform="translate(97 70) rotate(150)">
        <rect className="stk-face stk-edge-thin" x="0" y="-8" width="26" height="16" rx="5" />
        <rect fill={a} x="2" y="-5" width="12" height="10" rx="3" />
        <rect className="stk-accent" x="26" y="-5" width="7" height="10" rx="2" />
      </g>
      <Drop x={20} y={40} anim="stk-a-drip" />
      <Drop x={104} y={90} s={0.7} anim="stk-a-drip stk-delay" />
    </StickerKettle>
  ),
  great: ({ a }) => (
    <StickerKettle a={a} eyes="happy" mouth="grin" arms="up" blush anim="stk-a-hop">
      <Spark x={14} y={30} s={8} />
      <Spark x={106} y={28} s={9} anim="stk-a-twinkle stk-delay" />
      <Spark x={60} y={14} s={6} />
      <g transform="rotate(-20 32 16)">
        <rect className="stk-confetti stk-a-twinkle" x="30" y="12" width="5" height="9" rx="1.5" />
      </g>
      <g transform="rotate(25 88 12)">
        <rect className="stk-confetti stk-a-twinkle stk-delay" x="86" y="8" width="5" height="9" rx="1.5" />
      </g>
    </StickerKettle>
  ),
}
