import { ArtWarpFilter, artSrc } from './ArtWarpFilter.jsx'

const WALL_TOP = 176

function Lid({ cx, fill }) {
  return (
    <g className="art-shake-lid">
      <ellipse cx={cx} cy="63.5" rx="7.5" ry="8" fill={fill} />
      <path
        d={`M${cx - 7} 66 Q${cx} 70 ${cx + 7} 66`}
        fill="none"
        stroke="#5a3608"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </g>
  )
}

function Word({ x, y, size, className }) {
  return (
    <g className={`art-shake-word ${className}`} transform={`rotate(-12 ${x} ${y})`} fontSize={size}>
      <text x={x} y={y + 2} fill="#b8457f">
        шейк
      </text>
      <text x={x} y={y} fill="#F36BB8">
        шейк
      </text>
    </g>
  )
}

/** «Замешиваю протеин»: за стенкой трясёт рукой, шейкер на миг выглядывает, редко моргает. */
export function ArtShake({ uid }) {
  return (
    <>
      <defs>
        <linearGradient id={`${uid}s`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F4B53C" />
          <stop offset="1" stopColor="#E4A232" />
        </linearGradient>
        <ArtWarpFilter
          id={`${uid}f`}
          steps={[
            { map: 'shake-arm', values: '-8;10;-8', dur: '.28s', keyTimes: '0;.4;1', keySplines: '.3 0 .2 1;.5 0 .5 1' },
          ]}
        />
        <clipPath id={`${uid}c`}>
          <rect width="300" height={WALL_TOP} />
        </clipPath>
      </defs>
      <g filter={`url(#${uid}f)`}>
        <image href={artSrc('shake')} width="300" height="300" />
        <Lid cx={138.5} fill={`url(#${uid}s)`} />
        <Lid cx={162.5} fill={`url(#${uid}s)`} />
      </g>
      <g clipPath={`url(#${uid}c)`}>
        <g className="art-shake-lift">
          <image className="art-shake-jerk" href={artSrc('shake-shaker')} x="84" y="184" width="40" height="83" />
        </g>
      </g>
      <Word x={14} y={49} size={34} className="art-shake-word--1" />
      <Word x={30} y={97} size={24} className="art-shake-word--2" />
    </>
  )
}
