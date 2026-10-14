import { artSrc } from './ArtWarpFilter.jsx'

/** Пятно-маска одной ягодицы: в центре копия рисунка видна полностью, к краю растворяется в основе. */
function CheekMask({ id, cx, cy, rx, ry }) {
  return (
    <>
      <radialGradient
        id={`${id}g`}
        gradientUnits="userSpaceOnUse"
        cx={cx}
        cy={cy}
        r="1"
        gradientTransform={`translate(${cx} ${cy}) scale(${rx} ${ry}) translate(${-cx} ${-cy})`}
      >
        <stop offset="0.55" stopColor="#fff" />
        <stop offset="1" stopColor="#fff" stopOpacity="0" />
      </radialGradient>
      <mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width="300" height="300">
        <rect width="300" height="300" fill={`url(#${id}g)`} />
      </mask>
    </>
  )
}

/** «Ягодицы сами себя не накачают»: трясутся только ягодицы, каждая со своим запозданием. */
export function ArtGlutes({ uid }) {
  const src = artSrc('glutes')
  return (
    <>
      <defs>
        <CheekMask id={`${uid}l`} cx={117} cy={192} rx={63} ry={57} />
        <CheekMask id={`${uid}r`} cx={201} cy={189} rx={60} ry={57} />
      </defs>
      <image href={src} width="300" height="300" />
      <image href={src} width="300" height="300" mask={`url(#${uid}l)`} className="art-glutes-cheek art-glutes-cheek--l" />
      <image href={src} width="300" height="300" mask={`url(#${uid}r)`} className="art-glutes-cheek art-glutes-cheek--r" />
    </>
  )
}
