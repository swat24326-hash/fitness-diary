/** Своё фото профиля сотрудника на планшете / в админке — /api/me-profile. */
import { postMyProfile } from '../profileApiClient.js'
import { avatarApiOver } from './avatarApi.js'

export const staffAvatarApi = avatarApiOver(postMyProfile)
