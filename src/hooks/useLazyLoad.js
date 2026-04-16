import { useEffect, useRef, useState } from 'react'

/**
 * Observes an element and returns whether it has entered the viewport.
 * The IntersectionObserver is disconnected once the element becomes visible
 * so it only fires once.
 *
 * Usage:
 *   const { ref, isVisible } = useLazyLoad()
 *   return <div ref={ref}>{isVisible && <img src={url} />}</div>
 */
export function useLazyLoad(options = {}) {
  const ref = useRef(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setIsVisible(true)
        observer.disconnect()
      }
    }, { threshold: 0.1, ...options })

    observer.observe(el)

    return () => observer.disconnect()
  }, [])

  return { ref, isVisible }
}
