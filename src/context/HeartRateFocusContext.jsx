import { createContext, useContext, useMemo, useState } from 'react'

const HeartRateFocusContext = createContext(null)

export function HeartRateFocusProvider({ children }) {
  const [focused, setFocused] = useState(false)
  const value = useMemo(() => ({ focused, setFocused }), [focused])
  return <HeartRateFocusContext.Provider value={value}>{children}</HeartRateFocusContext.Provider>
}

export function useHeartRateFocus() {
  const ctx = useContext(HeartRateFocusContext)
  if (!ctx) {
    return {
      focused: false,
      setFocused: () => {},
    }
  }
  return ctx
}

export function useSetHeartRateFocus() {
  const { setFocused } = useHeartRateFocus()
  return setFocused
}
