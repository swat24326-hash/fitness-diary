import { ART_SIZE } from '../../../../lib/chat/chatArtStickerMaps.js'
import { useArtStickerMap } from './useArtStickerMap.js'

export const artSrc = (name) => `${import.meta.env.BASE_URL}stickers/art/${name}.webp`

/** Один шаг деформации: карта + SMIL-анимация силы (scale) по кадрам. */
function WarpStep({ map, input, result, values, dur, keyTimes, keySplines }) {
  const href = useArtStickerMap(map)
  return (
    <>
      <feImage
        href={href || undefined}
        x="0"
        y="0"
        width={ART_SIZE}
        height={ART_SIZE}
        preserveAspectRatio="none"
        result={`${result}m`}
      />
      <feDisplacementMap in={input} in2={`${result}m`} xChannelSelector="R" yChannelSelector="G" scale="0" result={result}>
        <animate
          attributeName="scale"
          values={values}
          dur={dur}
          repeatCount="indefinite"
          {...(keyTimes ? { keyTimes, calcMode: 'spline', keySplines } : {})}
        />
      </feDisplacementMap>
    </>
  )
}

/**
 * Фильтр из цепочки деформаций (каждая берёт результат предыдущей).
 * @param {{ id: string, steps: Array<{ map: string, values: string, dur: string, keyTimes?: string, keySplines?: string }> }} props
 */
export function ArtWarpFilter({ id, steps }) {
  return (
    <filter
      id={id}
      x="-20"
      y="-20"
      width={ART_SIZE + 40}
      height={ART_SIZE + 40}
      filterUnits="userSpaceOnUse"
      colorInterpolationFilters="sRGB"
    >
      {steps.map((s, i) => (
        <WarpStep key={s.map} {...s} input={i === 0 ? 'SourceGraphic' : `w${i - 1}`} result={`w${i}`} />
      ))}
    </filter>
  )
}
