/**
 * Куски записанного голосового на телефоне: прослушать перед отправкой (WAV из расшифрованных кусков — склейка без
 * швов и точная перемотка, чего не умеет сырой WebM от MediaRecorder) и подготовить к отправке (base64).
 */
import { pcm16Samples } from './chatVoiceCore.js'

const PREVIEW_RATE = 48000

/** Отсчёты -1…1 подряд → WAV 16 бит моно. */
export function pcmWav(chunks, rate) {
  const n = chunks.reduce((s, c) => s + c.length, 0)
  const out = new Uint8Array(44 + n * 2)
  const v = new DataView(out.buffer)
  const text = (at, s) => [...s].forEach((ch, i) => v.setUint8(at + i, ch.charCodeAt(0)))
  text(0, 'RIFF')
  v.setUint32(4, 36 + n * 2, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)
  v.setUint16(22, 1, true)
  v.setUint32(24, rate, true)
  v.setUint32(28, rate * 2, true)
  v.setUint16(32, 2, true)
  v.setUint16(34, 16, true)
  text(36, 'data')
  v.setUint32(40, n * 2, true)
  let at = 44
  for (const c of chunks) {
    const pcm = pcm16Samples(c)
    out.set(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength), at)
    at += pcm.byteLength
  }
  return out
}

const previews = new WeakMap()

/** Прослушать свою запись: WAV всех кусков подряд (один раз на запись). @param {{ parts: Blob[] }} result */
export function voicePreviewBlob(result) {
  if (!previews.has(result)) {
    const built = buildPreview(result.parts)
    built.catch(() => previews.delete(result))
    previews.set(result, built)
  }
  return previews.get(result)
}

async function buildPreview(parts) {
  const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext
  const ctx = new Ctx(1, 1, PREVIEW_RATE)
  const chunks = []
  for (const part of parts) {
    const buf = await ctx.decodeAudioData(await part.arrayBuffer())
    chunks.push(buf.getChannelData(0))
  }
  return new Blob([pcmWav(chunks, PREVIEW_RATE)], { type: 'audio/wav' })
}

async function blobBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

/** Куски к отправке — base64 по порядку. */
export function voicePartsBase64(parts) {
  return Promise.all(parts.map(blobBase64))
}
