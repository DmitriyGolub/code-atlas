import type { Spec, ViewerOptions } from './types'
import { COLUMN_WIDTH, createModel, shortName } from './model'
import { html } from './markup'
import { renderFrame } from './frame'
import { layoutCode, renderCodeMap, type CodeSort } from './codeMap'
import { LAYOUT } from './layout'
import { renderTree, revealInTree } from './tree'
import { wireSearch } from './search'
import { renderCard, FINDING_TITLES, type CardTab } from './card'
import { renderFilters, renderMetrics, renderStats } from './sidebar'
import { renderList, viewsOf, type Sorting, type View } from './listView'
import { createDock } from './dock'
import type { FlowView } from './flow'
import { icon } from './icons'
import { routeClick, toggleIn, type Actions } from './routes'
import { nextZoom } from './zoom'
import { scrollIntoContainer } from './scroll'
import { areasOf, renderTreeView, revealPath, type TreeState } from './treeView'

const SIDEBAR_MIN_WIDTH = 1280

export interface Viewer {
  select(id: string): void
  destroy(): void
}

export function mount(element: HTMLElement, spec: Spec, options: ViewerOptions = {}): Viewer {
  const model = createModel(spec, options.root, options.editor)
  element.classList.add('code-atlas', `mode-${model.mode}`)
  element.innerHTML = LAYOUT.markup
  if (element.clientWidth < SIDEBAR_MIN_WIDTH) element.classList.add('sidebar-hidden')
  const part = <Element extends HTMLElement = HTMLElement>(name: string) => element.querySelector<Element>(`[data-part="${name}"]`)!
  const showFields = part<HTMLInputElement>('fields')
  const flowView: FlowView = { tab: model.mode === 'frame' ? 'data' : 'calls', direction: 'both', only: new Set() }
  const dock = createDock(model, part, flowView)
  const state = { selected: null as string | null, view: 'graph' as View, sorting: { column: 0, descending: false } as Sorting, cardTab: 'overview' as CardTab, expanded: new Set<string>(), folded: new Set<string>(), zoom: 1 }
  const treeState: TreeState = { area: areasOf(spec.units)[0] ?? '', expanded: new Set() }
  if (model.mode === 'code') layoutCode(model, 'callers')

  const drawFrame = () => {
    const canvas = part('canvas')
    canvas.style.width = `${model.domains.length * COLUMN_WIDTH}px`
    canvas.style.height = `${model.height}px`
    canvas.style.setProperty('zoom', String(state.zoom))
    canvas.innerHTML = (model.mode === 'code' ? renderCodeMap(model, state.selected) : renderFrame(model, state.selected, showFields.checked)).markup
    part('zoom-level').textContent = `${Math.round(state.zoom * 100)}%`
  }
  const drawList = () => {
    if (state.view === 'graph') return
    part('list').classList.toggle('tree-view', state.view === 'tree')
    part('list').innerHTML = (state.view === 'tree' ? renderTreeView(spec.units, treeState, state.selected) : renderList(model, state.view, state.sorting, state.selected)).markup
  }
  const drawViews = () => {
    part('views').innerHTML = html`${viewsOf(model).map(([view, label, name]) => html`<button type="button" data-view="${view}" class="${view === state.view ? 'active' : ''}">${icon(name)}${label}</button>`)}`.markup
    part('frame').hidden = state.view !== 'graph'
    part('list').hidden = state.view === 'graph'
    part('toolbar').hidden = state.view !== 'graph'
    drawList()
  }
  const drawCard = () => { if (state.selected) part('card').innerHTML = renderCard(model, state.selected, state.cardTab, state.expanded, state.folded).markup }
  const drawFilters = () => { part('filters').innerHTML = renderFilters(flowView.only).markup }

  const select = (id: string) => {
    if (!id || !model.units.has(id)) return
    if (id !== state.selected) state.expanded.clear()
    state.selected = id
    drawCard()
    drawFrame()
    drawList()
    dock.show(id)
    revealInTree(part('tree'), id)
    revealPath(treeState, model.units.get(id)!, areasOf(spec.units))
    scrollIntoContainer(part('frame'), part('canvas').querySelector('.node.selected'))
    scrollIntoContainer(part('list'), part('list').querySelector('.tree-node.selected'))
    if (options.syncHash) {
      try { history.replaceState(null, '', `#${encodeURIComponent(id)}`) } catch {}
    }
  }
  const redrawSelection = () => { if (state.selected) select(state.selected) }
  const actions: Actions = {
    setView: (view) => { state.view = view as View; state.sorting = { column: 0, descending: false }; drawViews(); scrollIntoContainer(part('list'), part('list').querySelector('.tree-node.selected'), true) },
    sortBy: (column) => { state.sorting = { column, descending: state.sorting.column === column ? !state.sorting.descending : column > 0 }; drawList() },
    setTreeArea: (area) => { treeState.area = area; drawList() },
    toggleTreePath: (path) => { toggleIn(treeState.expanded, path); drawList() },
    setDockTab: (tab) => dock.setTab(tab as FlowView['tab']),
    setDirection: (direction) => dock.setDirection(direction as FlowView['direction']),
    setCardTab: (tab) => { state.cardTab = tab as CardTab; drawCard() },
    toggleBlock: (key) => { toggleIn(state.folded, key); drawCard() },
    expandChips: (key) => { state.expanded.add(key); drawCard() },
    zoom: (action) => { state.zoom = nextZoom(state.zoom, action, part('frame').clientWidth, model.domains.length * COLUMN_WIDTH); drawFrame() },
    togglePanel: (panel) => { element.classList.toggle(`${panel}-hidden`); dock.redraw() },
    toggleSection: (section) => section.classList.toggle('collapsed'),
    openSymbol: (id, fromFlow) => { if (fromFlow) dock.closeOverlay(); part('results').hidden = true; select(id) },
    focusBlock: (key) => dock.focusBlock(key),
    hideResults: () => { part('results').hidden = true },
  }
  const onClick = (event: MouseEvent) => routeClick(event.target as Element, actions)
  const onChange = (event: Event) => {
    const target = event.target as HTMLInputElement
    if (target.dataset.filter) { target.checked ? flowView.only.add(target.dataset.filter) : flowView.only.delete(target.dataset.filter); return dock.redraw() }
    if (target === showFields) return drawFrame()
    if (target.dataset.part === 'excluded') { model.edges = target.checked ? model.allEdges : model.allEdges.filter((edge) => !edge.excluded); drawFrame(); redrawSelection() }
    if (target.dataset.part === 'tree-area') return actions.setTreeArea(target.value)
    if (target.dataset.part === 'sort') { layoutCode(model, target.value as CodeSort); drawFrame() }
  }
  const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { dock.closeOverlay(); part('results').hidden = true } }, onResize = () => dock.redraw()
  const onHash = () => {
    const id = decodeURIComponent(location.hash.slice(1))
    if (id && id !== state.selected) select(id)
  }
  element.addEventListener('click', onClick)
  element.addEventListener('change', onChange)
  document.addEventListener('keydown', onKey)
  window.addEventListener('resize', onResize)
  if (options.syncHash) window.addEventListener('hashchange', onHash)
  part('expand').addEventListener('click', () => dock.openOverlay()); part('close').addEventListener('click', () => dock.closeOverlay())
  part('filters-reset').addEventListener('click', () => { flowView.only.clear(); drawFilters(); dock.redraw() })
  wireSearch(spec.units, part<HTMLInputElement>('search'), part('results'), select)

  part('tree').innerHTML = renderTree(spec.units).markup
  part('metrics').innerHTML = renderMetrics(model).markup
  part('stats').innerHTML = renderStats(model).markup
  part('title').title = `spec ${spec.codeAtlas} · source ${spec.sourceDigest}`
  if (spec.findings.length) {
    part('findings').hidden = false
    part('findings').innerHTML = html`<h2>Findings · ${spec.findings.length}</h2>${spec.findings.map((finding) => html`<div class="finding" data-go="${model.idOf(finding.system) ?? ''}"><em>${FINDING_TITLES[finding.kind]}</em><code>${shortName(finding.system)}</code> ${finding.text}</div>`)}`.markup
  }
  drawFilters()
  drawViews()
  drawFrame()
  if (options.syncHash) onHash()

  return {
    select,
    destroy() {
      element.removeEventListener('click', onClick)
      element.removeEventListener('change', onChange)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('hashchange', onHash)
      element.innerHTML = ''
      element.classList.remove('code-atlas', `mode-${model.mode}`)
    },
  }
}
