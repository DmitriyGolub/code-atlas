const MARGIN = 24

export function scrollIntoContainer(container: HTMLElement, element: Element | null, center = false): void {
  if (!element) return
  const outer = container.getBoundingClientRect()
  const box = element.getBoundingClientRect()
  const vertical = center ? box.top - outer.top - (outer.height - box.height) / 2
    : box.top < outer.top + MARGIN ? box.top - outer.top - MARGIN
      : box.bottom > outer.bottom - MARGIN ? box.bottom - outer.bottom + MARGIN : 0
  const horizontal = box.left < outer.left + MARGIN ? box.left - outer.left - MARGIN
    : box.right > outer.right - MARGIN ? box.right - outer.right + MARGIN : 0
  container.scrollBy({ top: vertical, left: horizontal })
}
