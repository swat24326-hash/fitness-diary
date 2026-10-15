/**
 * Куски голосового от телефона (WebM / Ogg Opus, MP4 AAC) → один MP3 для хранения, плеера и SpeechKit: склеить по
 * порядку, обрезать по ручкам, моно 48 кГц. Делает ffmpeg (apt install ffmpeg; путь — FFMPEG_PATH). Нет ffmpeg —
 * ошибка с code 'ENOENT'. Байты звука и пути файлов в лог не пишем.
 */
import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const VOICE_MP3_KBPS = 96
const TIMEOUT_MS = 60_000
const MAX_OUT_BYTES = 8 * 1024 * 1024
/** Два ядра на ВМ: больше двух перекодирований разом — ждут очереди, API не встаёт. */
const MAX_RUNNING = 2

/**
 * Аргументы ffmpeg: каждый кусок → 48 кГц моно, склейка, обрезка [с, по] секунд, MP3 в stdout без тегов.
 * @param {string[]} files
 * @param {[number, number] | null} trim
 */
export function voiceFfmpegArgs(files, trim) {
  const prep = files.map((_, i) => `[${i}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=mono[p${i}]`)
  const joined = `${files.map((_, i) => `[p${i}]`).join('')}concat=n=${files.length}:v=0:a=1`
  const cut = trim ? `,atrim=start=${trim[0]}:end=${trim[1]},asetpts=PTS-STARTPTS` : ''
  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-nostdin',
    ...files.flatMap((f) => ['-i', f]),
    '-filter_complex',
    `${prep.join(';')};${joined}${cut}[out]`,
    '-map',
    '[out]',
    '-map_metadata',
    '-1',
    '-c:a',
    'libmp3lame',
    '-b:a',
    `${VOICE_MP3_KBPS}k`,
    '-id3v2_version',
    '0',
    '-write_xing',
    '0',
    '-f',
    'mp3',
    'pipe:1',
  ]
}

function runFfmpeg(bin, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'ignore'] })
    const chunks = []
    let size = 0
    const timer = setTimeout(() => child.kill('SIGKILL'), TIMEOUT_MS)
    child.stdout.on('data', (c) => {
      size += c.length
      if (size > MAX_OUT_BYTES) child.kill('SIGKILL')
      else chunks.push(c)
    })
    child.on('error', (e) => {
      clearTimeout(timer)
      reject(e)
    })
    child.on('close', (code, signal) => {
      clearTimeout(timer)
      if (code === 0 && size <= MAX_OUT_BYTES) resolve(Buffer.concat(chunks))
      else reject(new Error(`ffmpeg_${signal || code}`))
    })
  })
}

let running = 0
const waiting = []
async function slot(fn) {
  if (running >= MAX_RUNNING) await new Promise((r) => waiting.push(r))
  running += 1
  try {
    return await fn()
  } finally {
    running -= 1
    waiting.shift()?.()
  }
}

/**
 * @param {Buffer[]} parts куски записи по порядку
 * @param {[number, number] | null} trim
 * @returns {Promise<Buffer>} MP3
 */
export function transcodeVoiceToMp3(parts, trim, env = process.env) {
  const bin = env.FFMPEG_PATH || 'ffmpeg'
  return slot(async () => {
    const dir = await mkdtemp(join(tmpdir(), 'fd-voice-'))
    try {
      const files = await Promise.all(
        parts.map(async (bytes, i) => {
          const file = join(dir, `part${i}`)
          await writeFile(file, bytes)
          return file
        }),
      )
      return await runFfmpeg(bin, voiceFfmpegArgs(files, trim))
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
}
