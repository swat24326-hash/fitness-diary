import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
  cycleVoiceSpeed,
  getVoiceState,
  seekVoice,
  subscribeVoice,
  toggleVoice,
  voiceSliceOf,
} from '../lib/chat/chatVoicePlayback.js'

const same = (a, b) =>
  a.status === b.status && a.progress === b.progress && a.error === b.error && a.speed === b.speed && a.played === b.played && a.consumed === b.consumed

/**
 * Пузырь голосового над общим плеером (chatVoicePlayback.js): перерисовывается, только когда меняется его голосовое.
 * @param {import('../lib/chat/chatVoicePlayback.js').VoiceTrack} track
 */
export function useChatVoicePlayer(track) {
  const [slice, setSlice] = useState(() => voiceSliceOf(track.key))
  const trackRef = useRef(track)
  trackRef.current = track
  const { key } = track

  useEffect(() => {
    const sync = () => {
      const next = voiceSliceOf(key)
      setSlice((prev) => (same(prev, next) ? prev : next))
    }
    sync()
    return subscribeVoice(sync)
  }, [key])

  const toggle = useCallback(() => toggleVoice(trackRef.current), [])
  const seek = useCallback((ratio, opts) => seekVoice(trackRef.current, ratio, opts), [])
  return { ...slice, toggle, seek, cycleSpeed: cycleVoiceSpeed }
}

/** Всё состояние плеера — для мини-плеера. */
export function useChatVoicePlayback() {
  return useSyncExternalStore(subscribeVoice, getVoiceState)
}
