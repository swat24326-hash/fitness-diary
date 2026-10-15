import { useState } from 'react'
import '../../styles/profile-avatar.css'

/**
 * Фото профиля внутри круглой аватарки; нет фото, нет сети или файл удалён — fallback (инициалы / значок).
 * @param {{ src?: string | null, fallback: import('react').ReactNode }} props
 */
export function AvatarPhoto({ src, fallback }) {
  const [broken, setBroken] = useState('')
  if (!src || broken === src) return fallback
  return <img className="avatar-photo" src={src} alt="" loading="lazy" decoding="async" draggable={false} onError={() => setBroken(src)} />
}
