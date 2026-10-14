import { ArtWarpFilter, artSrc } from './ArtWarpFilter.jsx'

const EASE4 = '.45 0 .55 1;.45 0 .55 1;.45 0 .55 1;.45 0 .55 1'

/** «Когда в зале включили мой трек»: бёдра дугой влево-вверх и вправо-вверх, колени на месте. */
export function ArtDance({ uid }) {
  return (
    <>
      <defs>
        <ArtWarpFilter
          id={`${uid}f`}
          steps={[
            { map: 'dance-x', values: '0;20;0;-20;0', dur: '1.2s', keyTimes: '0;.25;.5;.75;1', keySplines: EASE4 },
            { map: 'dance-y', values: '0;14;0;14;0', dur: '1.2s', keyTimes: '0;.25;.5;.75;1', keySplines: EASE4 },
          ]}
        />
      </defs>
      <image href={artSrc('dance')} width="300" height="300" filter={`url(#${uid}f)`} />
    </>
  )
}
