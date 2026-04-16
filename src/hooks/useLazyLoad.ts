import { useEffect, useRef, useState } from 'react'

export function useLazyLoad<T extends HTMLElement = HTMLElement>(
  options: IntersectionObserverInit = {}
): { ref: React.RefObject<T>; isVisible: boolean } {
  const ref = useRef<T>(null)
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
