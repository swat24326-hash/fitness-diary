export {
  HeartRateSessionsProvider as HeartRateFocusProvider,
} from './HeartRateSessionsContext'

export function useHeartRateFocus() {
  return { focused: false, setFocused: () => {} }
}

export function useSetHeartRateFocus() {
  return () => {}
}
