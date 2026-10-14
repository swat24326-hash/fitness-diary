import { ArtWarpFilter, artSrc } from './ArtWarpFilter.jsx'

/** «После первой тренировки»: походка вразвалку — руки маятником, вес с ноги на ногу, голова ровно. */
export function ArtStrut({ uid }) {
  return (
    <>
      <defs>
        <ArtWarpFilter
          id={`${uid}f`}
          steps={[
            {
              map: 'strut-arms',
              values: '-18;18;-18',
              dur: '1.6s',
              keyTimes: '0;.5;1',
              keySplines: '.45 0 .55 1;.45 0 .55 1',
            },
          ]}
        />
      </defs>
      <g className="art-strut-walk">
        <image href={artSrc('strut')} width="300" height="300" filter={`url(#${uid}f)`} />
      </g>
    </>
  )
}
