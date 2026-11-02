import { useAdjacentApp } from '@purescience/platform-ui/bridge/react/useAdjacentApp'

/**
 * True only while PureSite is held in an entry of the Executive room, or sits beside it in split view. Everything
 * compact hangs off this one answer; "Full app" on the entry, or Expand on the pane, gives the whole app back.
 */
export function useCompactInRoom(): boolean {
  return useAdjacentApp()?.heldInRoom === true
}
