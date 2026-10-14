import { useMemo } from 'react'
import { buildArtMapPixels } from '../../../../lib/chat/chatArtStickerMaps.js'

const cache = new Map()

/** data:URL карты смещения для feImage; одна на сессию, сколько бы стикеров ни было в ленте. */
export function useArtStickerMap(name) {
  return useMemo(() => {
    if (cache.has(name)) return cache.get(name)
    const px = buildArtMapPixels(name)
    if (!px || typeof document === 'undefined') return ''
    const canvas = document.createElement('canvas')
    canvas.width = px.w
    canvas.height = px.h
    canvas.getContext('2d').putImageData(new ImageData(px.data, px.w, px.h), 0, 0)
    const url = canvas.toDataURL()
    cache.set(name, url)
    return url
  }, [name])
}
