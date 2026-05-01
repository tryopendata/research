import { useEffect, useState } from 'react'

/**
 * Track the width of a container element. Returns null until the first measurement.
 * Uses ResizeObserver, so updates automatically on container/viewport changes.
 */
export function useContainerWidth(ref: React.RefObject<HTMLElement | null>): number | null {
  const [width, setWidth] = useState<number | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const initialRect = el.getBoundingClientRect()
    if (initialRect.width > 0) setWidth(initialRect.width)

    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const w = entry.contentRect.width
        if (w > 0) setWidth(w)
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])

  return width
}
