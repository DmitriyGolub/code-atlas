import type { Unit } from './types'
import { html, type Markup } from './markup'
import { icon } from './icons'

const NODE_WIDTH = 220
const NODE_HEIGHT = 30
const ROW_GAP = 8
const COLUMN_GAP = 56
const PADDING = 20
const SHOWN_KINDS = new Set(['system', 'component', 'rule', 'entity', 'outside', 'query', 'method'])
const MAX_AREA_CHIPS = 10
const ROOT_FILES = 'root files'

interface TreeNode {
  path: string
  name: string
  kind: 'folder' | 'file' | 'symbol'
  unit?: Unit
  children: TreeNode[]
  symbols: number
}

interface Placed { node: TreeNode; x: number; y: number; depth: number }

export interface TreeState { area: string; expanded: Set<string> }

function buildForest(units: Unit[]): TreeNode[] {
  const root: TreeNode = { path: '', name: '', kind: 'folder', children: [], symbols: 0 }
  const childOf = (parent: TreeNode, name: string, kind: TreeNode['kind']) => {
    const path = parent.path ? `${parent.path}/${name}` : name
    let child = parent.children.find((item) => item.path === path)
    if (!child) parent.children.push((child = { path, name, kind, children: [], symbols: 0 }))
    return child
  }
  for (const unit of units.filter((item) => SHOWN_KINDS.has(item.kind))) {
    const parts = unit.file.split('/')
    const file = parts.pop()!
    let folder = root
    for (const part of parts) { folder.symbols++; folder = childOf(folder, part, 'folder') }
    folder.symbols++
    const leaf = childOf(folder, file, 'file')
    leaf.symbols++
    const node: TreeNode = { path: unit.id, name: unit.name.split('.').pop()!, kind: 'symbol', unit, children: [], symbols: 1 }
    const owner = unit.owner ? leaf.children.find((item) => item.path === unit.owner) : undefined
    ;(owner ?? leaf).children.push(node)
  }
  const squash = (node: TreeNode): TreeNode => {
    while (node.kind === 'folder' && node.children.length === 1 && node.children[0].kind === 'folder') {
      const only = node.children[0]
      node = { ...only, name: `${node.name}/${only.name}` }
    }
    node.children = node.children.map(squash).sort((first, second) => Number(first.kind === 'file') - Number(second.kind === 'file') || first.name.localeCompare(second.name))
    return node
  }
  const top = squash(root)
  const folders = top.children.filter((node) => node.kind === 'folder')
  const files = top.children.filter((node) => node.kind === 'file')
  if (!files.length) return folders
  const loose: TreeNode = { path: top.path || ROOT_FILES, name: top.name || ROOT_FILES, kind: 'folder', children: files, symbols: files.reduce((sum, file) => sum + file.symbols, 0) }
  return [...folders, loose]
}

function place(node: TreeNode, state: TreeState, depth: number, placed: Placed[], next: { row: number }): number {
  const open = node.children.length > 0 && state.expanded.has(node.path)
  const childRows = open ? node.children.map((child) => place(child, state, depth + 1, placed, next)) : []
  const row = childRows.length ? childRows[0] : next.row++
  placed.push({ node, depth, x: PADDING + depth * (NODE_WIDTH + COLUMN_GAP), y: PADDING + row * (NODE_HEIGHT + ROW_GAP) })
  return row
}

const label = (node: TreeNode) =>
  node.kind === 'symbol' ? html`<i class="dot kind-${node.unit!.kind}"></i><span>${node.name}</span><small>${node.unit!.callers.length}</small>`
    : html`${icon(node.kind === 'folder' ? 'folder' : 'file')}<span>${node.name}</span><small>${node.symbols}</small>`

export function areasOf(units: Unit[]): string[] {
  return buildForest(units).map((node) => node.path)
}

export function revealPath(state: TreeState, unit: Unit, areas: string[]): void {
  const area = areas.find((path) => unit.file === path || unit.file.startsWith(`${path}/`))
  if (area) state.area = area
  const parts = unit.file.split('/')
  for (let index = 1; index <= parts.length; index++) state.expanded.add(parts.slice(0, index).join('/'))
  state.expanded.add(unit.id)
  if (unit.owner) state.expanded.add(unit.owner)
}

export function renderTreeView(units: Unit[], state: TreeState, selected: string | null): Markup {
  const forest = buildForest(units)
  const root = forest.find((node) => node.path === state.area) ?? forest[0]
  if (!root) return html`<p class="hint">No files.</p>`
  state.expanded.add(root.path)
  const placed: Placed[] = []
  place(root, state, 0, placed, { row: 0 })
  const byPath = new Map(placed.map((item) => [item.node.path, item]))
  const width = Math.max(...placed.map((item) => item.x)) + NODE_WIDTH + PADDING
  const height = Math.max(...placed.map((item) => item.y)) + NODE_HEIGHT + PADDING
  const links = placed.flatMap((parent) => (state.expanded.has(parent.node.path) ? parent.node.children : []).map((child) => {
    const end = byPath.get(child.path)!
    const startX = parent.x + NODE_WIDTH
    const middle = startX + COLUMN_GAP / 2
    return html`<path d="M${startX},${parent.y + NODE_HEIGHT / 2} H${middle} V${end.y + NODE_HEIGHT / 2} H${end.x}"/>`
  }))
  const nodes = placed.map(({ node, x, y }) => {
    const open = state.expanded.has(node.path)
    const action = node.kind === 'symbol' ? html`data-go="${node.path}"` : html`data-tree-toggle="${node.path}"`
    const classes = ['tree-node', node.kind, node.children.length ? (open ? 'open' : 'closed') : '', node.path === selected ? 'selected' : ''].filter(Boolean).join(' ')
    return html`<button type="button" class="${classes}" ${action} style="left:${x}px;top:${y}px;width:${NODE_WIDTH}px" title="${node.path}">${label(node)}</button>`
  })
  const areas = forest.length > MAX_AREA_CHIPS
    ? html`<label class="toggle">${icon('folder')}Area <select data-part="tree-area">${forest.map((node) => html`<option value="${node.path}"${node.path === root.path ? html` selected` : ''}>${node.name} · ${node.symbols}</option>`)}</select></label>`
    : html`${forest.map((node) => html`<button type="button" data-tree-area="${node.path}" class="${node.path === root.path ? 'active' : ''}">${icon('folder')}${node.name}<span class="count">${node.symbols}</span></button>`)}`
  return html`<div class="tree-areas">${areas}</div><div class="tree-canvas" style="width:${width}px;height:${height}px"><svg width="${width}" height="${height}">${links}</svg>${nodes}</div>`
}
