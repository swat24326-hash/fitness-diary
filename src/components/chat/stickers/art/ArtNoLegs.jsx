import { ArtWarpFilter, artSrc } from './ArtWarpFilter.jsx'

const YAW_EASE = '0 0 1 1;.45 0 .55 1;0 0 1 1;.45 0 .55 1;0 0 1 1;.45 0 .55 1;0 0 1 1'

/** «Ноги? Не, не слышал»: утка-качок слегка поворачивает голову, тонкие ножки дрожат. */
export function ArtNoLegs({ uid }) {
  return (
    <>
      <defs>
        <ArtWarpFilter
          id={`${uid}f`}
          steps={[
            {
              map: 'no-legs-yaw',
              values: '0;0;-7;-7;7;7;0;0',
              dur: '3.2s',
              keyTimes: '0;.25;.38;.48;.62;.72;.84;1',
              keySplines: YAW_EASE,
            },
            { map: 'no-legs-legs', values: '-2.2;2.2;-2.2', dur: '.14s' },
          ]}
        />
      </defs>
      <image href={artSrc('no-legs')} width="300" height="300" filter={`url(#${uid}f)`} />
    </>
  )
}
