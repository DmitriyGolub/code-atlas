export interface Actions {
  setView(view: string): void
  sortBy(column: number): void
  setTreeArea(area: string): void
  toggleTreePath(path: string): void
  setDockTab(tab: string): void
  setDirection(direction: string): void
  setCardTab(tab: string): void
  toggleBlock(key: string): void
  expandChips(key: string): void
  zoom(action: string): void
  togglePanel(panel: string): void
  toggleSection(section: HTMLElement): void
  openSymbol(id: string, fromFlow: boolean): void
  focusBlock(key: string | null): void
  hideResults(): void
}

interface Route {
  selector: string
  run(element: HTMLElement, actions: Actions): void
}

const CLICK_ROUTES: Route[] = [
  { selector: '[data-view]', run: (element, actions) => actions.setView(element.dataset.view!) },
  { selector: 'th[data-sort]', run: (element, actions) => actions.sortBy(Number(element.dataset.sort)) },
  { selector: '[data-tree-area]', run: (element, actions) => actions.setTreeArea(element.dataset.treeArea!) },
  { selector: '[data-tree-toggle]', run: (element, actions) => actions.toggleTreePath(element.dataset.treeToggle!) },
  { selector: '[data-dock-tab]', run: (element, actions) => actions.setDockTab(element.dataset.dockTab!) },
  { selector: '[data-direction]', run: (element, actions) => actions.setDirection(element.dataset.direction!) },
  { selector: '[data-card-tab]', run: (element, actions) => actions.setCardTab(element.dataset.cardTab!) },
  { selector: '[data-block]', run: (element, actions) => actions.toggleBlock(element.dataset.block!) },
  { selector: '[data-expand]', run: (element, actions) => actions.expandChips(element.dataset.expand!) },
  { selector: '[data-zoom]', run: (element, actions) => actions.zoom(element.dataset.zoom!) },
  { selector: '[data-panel]', run: (element, actions) => actions.togglePanel(element.dataset.panel!) },
  { selector: '[data-collapse]', run: (element, actions) => actions.toggleSection(element.closest<HTMLElement>('.panel')!) },
  { selector: '.node[data-id]', run: (element, actions) => actions.openSymbol(element.dataset.id!, false) },
  { selector: '.flow-node[data-go]', run: (element, actions) => actions.openSymbol(element.dataset.go!, true) },
  { selector: '.flow-node[data-key]:not(.center)', run: (element, actions) => actions.focusBlock(element.dataset.key!) },
  { selector: '[data-close-info]', run: (_, actions) => actions.focusBlock(null) },
  { selector: '[data-go]', run: (element, actions) => actions.openSymbol(element.dataset.go!, false) },
]

export function routeClick(target: Element, actions: Actions): void {
  for (const route of CLICK_ROUTES) {
    const element = target.closest<HTMLElement>(route.selector)
    if (element) return route.run(element, actions)
  }
  if (!target.closest('.search')) actions.hideResults()
}

export const toggleIn = (set: Set<string>, key: string): void => { set.has(key) ? set.delete(key) : set.add(key) }
