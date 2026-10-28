/**
 * Пустой экран выкладки: абстрактные переливы и слоган «Сияй»
 * (мягко, как заставка после входа — без «логотипа-солнышка»).
 */
export function StoryComposeEmpty() {
  return (
    <div className="stories-compose__empty">
      <div className="stories-compose__empty-field" aria-hidden>
        <span className="stories-compose__empty-blob stories-compose__empty-blob--a" />
        <span className="stories-compose__empty-blob stories-compose__empty-blob--b" />
        <span className="stories-compose__empty-blob stories-compose__empty-blob--c" />
        <span className="stories-compose__empty-veil" />
      </div>
      <p className="stories-compose__slogan">Сияй</p>
    </div>
  )
}
