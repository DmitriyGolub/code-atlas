import type { Unit } from './types'
import { COLUMN_WIDTH, ROW_HEIGHT, type Model } from './model'
import { curve, NODE_INSET } from './frame'
import { html, type Markup } from './markup'

export type CodeSort = 'callers' | 'name'

const COLUMNS = 10
const ROWS = 18
const KINDS = new Set(['rule', 'entity', 'outside', 'system', 'component'])
const CONSTANT = /^[A-Z0-9_]+$/

const folderOf = (unit: Unit) => unit.file.split('/').slice(1, -1).slice(0, 2).join('/') || unit.file.split('/')[0]

export function layoutCode(model: Model, sort: CodeSort): void {
  const byFolder = new Map<string, Unit[]>()
  for (const unit of model.spec.units) {
    if (!KINDS.has(unit.kind) || !unit.callers.length || CONSTANT.test(unit.name)) continue
    byFolder.set(folderOf(unit), [...(byFolder.get(folderOf(unit)) ?? []), unit])
  }
  const weight = (list: Unit[]) => list.reduce((sum, unit) => sum + unit.callers.length, 0)
  const order = sort === 'name' ? (first: Unit, second: Unit) => first.name.localeCompare(second.name) : (first: Unit, second: Unit) => second.callers.length - first.callers.length
  const folders = [...byFolder].sort((first, second) => weight(second[1]) - weight(first[1])).slice(0, COLUMNS)
  if (sort === 'name') folders.sort((first, second) => first[0].localeCompare(second[0]))
  model.domains = []
  model.codeNodes = []
  model.layout.clear()
  folders.forEach(([folder, list], column) => {
    model.domains.push(folder)
    const top = [...list].sort((first, second) => second.callers.length - first.callers.length).slice(0, ROWS).sort(order)
    top.forEach((unit, row) => {
      model.codeNodes.push(unit)
      model.layout.set(unit.id, { x: column * COLUMN_WIDTH, y: 30 + row * ROW_HEIGHT })
    })
  })
  model.height = Math.max(0, ...[...model.layout.values()].map((point) => point.y)) + 60
}

export function renderCodeMap(model: Model, selected: string | null): Markup {
  const shown = new Set(model.codeNodes.map((unit) => unit.id))
  const links = new Map<string, { from: string; to: string }>()
  for (const unit of model.codeNodes) {
    for (const call of unit.calls ?? []) if (shown.has(call.unit) && call.unit !== unit.id) links.set(`${unit.id}>${call.unit}`, { from: unit.id, to: call.unit })
  }
  const touches = (link: { from: string; to: string }) => link.from === selected || link.to === selected
  const related = new Set([...links.values()].filter(touches).flatMap((link) => [link.from, link.to]))
  const active = Boolean(selected && shown.has(selected))
  const paths = [...links.values()].map((link) => html`<path class="call${active ? (touches(link) ? ' lit' : ' dim') : ''}" d="${curve(model.layout.get(link.from)!, model.layout.get(link.to)!)}"/>`)
  const columns = model.domains.map((domain, column) => html`<div class="column" style="left:${column * COLUMN_WIDTH}px;width:${COLUMN_WIDTH - 10}px;height:${model.height}px"><b title="${domain}">${domain}</b></div>`)
  const nodes = model.codeNodes.map((unit) => {
    const point = model.layout.get(unit.id)!
    const state = unit.id === selected ? 'selected' : related.has(unit.id) ? 'related' : active ? 'dim' : ''
    return html`<div class="${['node', state].filter(Boolean).join(' ')}" data-id="${unit.id}" style="left:${point.x}px;top:${point.y}px;width:${COLUMN_WIDTH - NODE_INSET}px" title="${unit.name} · ${unit.kind} · ${unit.callers.length} callers"><span>${unit.name}</span><small>${unit.callers.length}</small></div>`
  })
  return html`${columns}<svg width="${model.domains.length * COLUMN_WIDTH}" height="${model.height}">${paths}</svg>${nodes}`
}
