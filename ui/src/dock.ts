import type { Model } from './model'
import { drawFlow, type FlowView } from './flow'
import { blockInfo } from './blockInfo'

type Part = (name: string) => HTMLElement
const PANES = [['dock', false], ['overlay', true]] as const

export function createDock(model: Model, part: Part, view: FlowView) {
  let id: string | null = null
  let focus: string | null = null
  const overlayOpen = () => !part('overlay').hidden

  const syncHeads = () => {
    for (const [prefix] of PANES) {
      part(`${prefix}-tabs`).querySelectorAll<HTMLElement>('[data-dock-tab]').forEach((button) => button.classList.toggle('active', button.dataset.dockTab === view.tab))
      part(`${prefix}-direction`).querySelectorAll<HTMLElement>('[data-direction]').forEach((button) => button.classList.toggle('active', button.dataset.direction === view.direction))
      if (id) part(`${prefix}-title`).textContent = model.units.get(id)!.name
    }
  }

  const redraw = () => {
    if (!id) return
    const info = focus ? blockInfo(model, id, focus) : null
    if (!info) focus = null
    for (const [prefix, roomy] of PANES) {
      if (roomy && !overlayOpen()) continue
      const panel = part(`${prefix}-info`)
      panel.hidden = !info
      if (info) panel.innerHTML = info.markup
      drawFlow(model, part(`${prefix}-flow`), id, roomy, view, focus)
    }
    syncHeads()
  }

  return {
    show(next: string) {
      id = next
      focus = null
      part('dock').hidden = false
      redraw()
    },
    focusBlock(key: string | null) {
      focus = key
      redraw()
    },
    setTab(tab: FlowView['tab']) {
      view.tab = tab
      focus = null
      redraw()
    },
    setDirection(direction: FlowView['direction']) {
      view.direction = direction
      redraw()
    },
    openOverlay() {
      if (!id) return
      part('overlay').hidden = false
      redraw()
    },
    closeOverlay() {
      part('overlay').hidden = true
    },
    redraw,
  }
}
