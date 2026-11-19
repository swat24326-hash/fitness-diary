/**
 * Constraints камеры для записи сторис.
 * Не форсируем 9:16 / 1080×1920: на планшетах (Xiaomi и др.) драйвер
 * вырезает центр широкого сенсора → сильный зум в превью и в ролике.
 */

/**
 * @param {'environment' | 'user' | string} [facingMode]
 * @returns {MediaStreamConstraints}
 */
export function storyVideoCameraConstraints(facingMode = 'environment') {
  const facing = facingMode === 'user' ? 'user' : 'environment'
  return {
    video: {
      facingMode: { ideal: facing },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    },
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false },
  }
}
