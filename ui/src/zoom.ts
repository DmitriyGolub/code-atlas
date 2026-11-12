const STEPS = [0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5]
const FIT_MARGIN = 40

export const MIN_ZOOM = STEPS[0]
export const MAX_ZOOM = STEPS[STEPS.length - 1]

const clamp = (value: number) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value))

export function nextZoom(current: number, action: string, available: number, content: number): number {
  if (action === 'fit') return clamp(available / Math.max(1, content + FIT_MARGIN))
  const index = STEPS.findIndex((step) => step >= current - 0.001)
  const from = index < 0 ? STEPS.length - 1 : index
  return STEPS[Math.max(0, Math.min(STEPS.length - 1, from + (action === 'in' ? 1 : -1)))]
}
