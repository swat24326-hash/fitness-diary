/** GET /api/story-media?t=… — видео сторис с Range (короткий JWT, без Bearer). */
import { storyMediaHandler } from './_lib/stories/storyMediaHandler.js'
import { withSafeApiHandler } from './_lib/safeApiHandler.js'

export default withSafeApiHandler(storyMediaHandler, { label: 'story-media' })
