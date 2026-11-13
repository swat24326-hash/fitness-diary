/**
 * MP4 faststart: перенос moov перед mdat (как qt-faststart), без перекодирования.
 * WebM не трогаем. Битый / нестандартный файл — null (оставить как есть).
 */

/**
 * @param {Uint8Array} bytes
 * @returns {{ type: string, offset: number, size: number }[]}
 */
export function storyMp4TopAtoms(bytes) {
  const out = []
  let i = 0
  const n = bytes.length
  while (i + 8 <= n) {
    const size32 = (bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3]
    const type = String.fromCharCode(bytes[i + 4], bytes[i + 5], bytes[i + 6], bytes[i + 7])
    let size = size32 >>> 0
    let header = 8
    if (size === 1) {
      if (i + 16 > n) break
      const hi = (bytes[i + 8] << 24) | (bytes[i + 9] << 16) | (bytes[i + 10] << 8) | bytes[i + 11]
      const lo = (bytes[i + 12] << 24) | (bytes[i + 13] << 16) | (bytes[i + 14] << 8) | bytes[i + 15]
      size = hi * 0x100000000 + (lo >>> 0)
      header = 16
    } else if (size === 0) {
      size = n - i
    }
    if (!Number.isFinite(size) || size < header || i + size > n) break
    out.push({ type, offset: i, size })
    i += size
  }
  return out
}

/**
 * Нужен faststart: moov лежит после mdat.
 * @param {Uint8Array} bytes
 */
export function storyMp4NeedsFaststart(bytes) {
  if (!bytes || bytes.length < 16) return false
  if (!(bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70)) return false
  const atoms = storyMp4TopAtoms(bytes)
  const moov = atoms.find((a) => a.type === 'moov')
  const mdat = atoms.find((a) => a.type === 'mdat')
  if (!moov || !mdat) return false
  return moov.offset > mdat.offset
}

/**
 * @param {Uint8Array} buf
 * @param {number} offset
 * @param {number} delta
 */
function patchChunkOffsets(buf, offset, delta) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const end = offset + ((buf[offset] << 24) | (buf[offset + 1] << 16) | (buf[offset + 2] << 8) | buf[offset + 3])
  let i = offset + 8
  while (i + 8 <= end && i + 8 <= buf.length) {
    const size32 = (buf[i] << 24) | (buf[i + 1] << 16) | (buf[i + 2] << 8) | buf[i + 3]
    const type = String.fromCharCode(buf[i + 4], buf[i + 5], buf[i + 6], buf[i + 7])
    let size = size32 >>> 0
    let header = 8
    if (size === 1) {
      if (i + 16 > end) break
      const hi = (buf[i + 8] << 24) | (buf[i + 9] << 16) | (buf[i + 10] << 8) | buf[i + 11]
      const lo = (buf[i + 12] << 24) | (buf[i + 13] << 16) | (buf[i + 14] << 8) | buf[i + 15]
      size = hi * 0x100000000 + (lo >>> 0)
      header = 16
    } else if (size === 0) size = end - i
    if (!Number.isFinite(size) || size < header || i + size > end) break

    if (type === 'stco' && i + 16 <= i + size) {
      const count = view.getUint32(i + 12)
      let p = i + 16
      for (let c = 0; c < count && p + 4 <= i + size; c += 1) {
        view.setUint32(p, view.getUint32(p) + delta)
        p += 4
      }
    } else if (type === 'co64' && i + 16 <= i + size) {
      const count = view.getUint32(i + 12)
      let p = i + 16
      for (let c = 0; c < count && p + 8 <= i + size; c += 1) {
        const hi = view.getUint32(p)
        const lo = view.getUint32(p + 4)
        let v = hi * 0x100000000 + (lo >>> 0) + delta
        view.setUint32(p, Math.floor(v / 0x100000000))
        view.setUint32(p + 4, v >>> 0)
        p += 8
      }
    } else if (
      type === 'trak' ||
      type === 'mdia' ||
      type === 'minf' ||
      type === 'stbl' ||
      type === 'edts'
    ) {
      patchChunkOffsets(buf, i, delta)
    }
    i += size
  }
}

/**
 * @param {Uint8Array} bytes
 * @returns {Uint8Array | null} новый буфер или null — уже ok / не смогли
 */
export function storyMp4Faststart(bytes) {
  if (!storyMp4NeedsFaststart(bytes)) return null
  const atoms = storyMp4TopAtoms(bytes)
  const moov = atoms.find((a) => a.type === 'moov')
  if (!moov) return null

  const moovBytes = bytes.subarray(moov.offset, moov.offset + moov.size)
  const patched = new Uint8Array(moov.size)
  patched.set(moovBytes)
  // moov встаёт перед mdat → все абсолютные offset в stco/co64 растут на размер moov
  patchChunkOffsets(patched, 0, moov.size)

  const out = new Uint8Array(bytes.length)
  let w = 0
  for (const atom of atoms) {
    if (atom.type === 'moov') continue
    if (atom.type === 'mdat') {
      out.set(patched, w)
      w += patched.length
    }
    out.set(bytes.subarray(atom.offset, atom.offset + atom.size), w)
    w += atom.size
  }
  // Хвост после последнего атома (редко)
  const last = atoms[atoms.length - 1]
  if (last && last.offset + last.size < bytes.length) {
    const tail = bytes.subarray(last.offset + last.size)
    out.set(tail, w)
    w += tail.length
  }
  return w === bytes.length ? out : out.subarray(0, w)
}

/**
 * @param {Uint8Array} bytes
 * @param {string | null | undefined} mime
 * @returns {Uint8Array}
 */
export function storyVideoApplyFaststart(bytes, mime) {
  if (String(mime || '').split(';')[0].trim() !== 'video/mp4') return bytes
  try {
    const next = storyMp4Faststart(bytes)
    return next || bytes
  } catch {
    return bytes
  }
}
