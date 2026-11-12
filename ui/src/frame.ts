import type { Edge, EdgeKind } from './types'
import { COLUMN_WIDTH, relations, shortName, viaText, type Model } from './model'
import { html, type Markup } from './markup'

const RANK: Record<EdgeKind, number> = { event: 0, tag: 1, field: 2 }
export const NODE_INSET = 14

interface Highlight {
  center: string | null
  related: Set<string>
  writers: Set<string>
}

function highlightOf(model: Model, selected: string | null): Highlight {
  if (!selected) return { center: null, related: new Set(), writers: new Set() }
  const unit = model.units.get(selected)!
  if (unit.kind === 'system') {
    const touching = model.edges.filter((edge) => edge.from === unit.name || edge.to === unit.name)
    return { center: unit.name, related: new Set(touching.flatMap((edge) => [edge.from, edge.to])), writers: new Set() }
  }
  const flow = relations(model, selected)
  return { center: null, related: new Set(flow.downstream.map((entry) => entry.name)), writers: new Set(flow.upstream.map((entry) => entry.name)) }
}

export function curve(from: { x: number; y: number }, to: { x: number; y: number }): string {
  let x1 = from.x + COLUMN_WIDTH - NODE_INSET
  const y1 = from.y + NODE_INSET
  let x2 = to.x
  const y2 = to.y + NODE_INSET
  if (from.x === to.x) {
    x2 = to.x + COLUMN_WIDTH - NODE_INSET
    return `M${x1},${y1} C${x1 + 40},${y1} ${x2 + 40},${y2} ${x2},${y2}`
  }
  let pull = Math.max(50, Math.abs(x2 - x1) * 0.45)
  if (x2 < x1) {
    x1 = from.x
    x2 = to.x + COLUMN_WIDTH - NODE_INSET
    pull = -pull
  }
  return `M${x1},${y1} C${x1 + pull},${y1} ${x2 - pull},${y2} ${x2},${y2}`
}

export function renderFrame(model: Model, selected: string | null, showFields: boolean): Markup {
  const { center, related, writers } = highlightOf(model, selected)
  const active = Boolean(center || related.size || writers.size)
  const pairs = new Map<string, Edge & { vias: string[] }>()
  for (const edge of model.edges) {
    if (!showFields && edge.kind === 'field' && !(center && (edge.from === center || edge.to === center))) continue
    const key = `${edge.from}>${edge.to}`
    const current = pairs.get(key)
    if (!current || RANK[edge.kind] < RANK[current.kind]) pairs.set(key, { ...edge, vias: [...(current?.vias ?? []), edge.via] })
    else current.vias.push(edge.via)
  }
  const width = model.domains.length * COLUMN_WIDTH
  const paths = [...pairs.values()].map((edge) => {
    const lit = center ? edge.from === center || edge.to === center : writers.has(edge.from) || related.has(edge.to)
    const state = active ? (lit ? 'lit' : 'dim') : ''
    return html`<path class="${[edge.kind, edge.nextFrame ? 'next' : '', state].filter(Boolean).join(' ')}" d="${curve(model.layout.get(edge.from)!, model.layout.get(edge.to)!)}"><title>${edge.vias.map(viaText).join(', ')}</title></path>`
  })
  const columns = model.domains.map((domain, column) => html`<div class="column" style="left:${column * COLUMN_WIDTH}px;width:${COLUMN_WIDTH - 10}px;height:${model.height}px"><b>${domain}</b></div>`)
  const nodes = model.systems.map((system) => {
    const point = model.layout.get(system.name)!
    const state = system.name === center ? 'selected' : writers.has(system.name) ? 'writer' : related.has(system.name) ? 'related' : active ? 'dim' : ''
    const classes = ['node', model.fresh.has(system.name) ? 'fresh' : '', model.flagged.has(system.name) ? 'flagged' : '', state].filter(Boolean).join(' ')
    const step = system.position ? `runs #${system.position} in every frame` : 'not in the frame pipeline'
    return html`<div class="${classes}" data-id="${system.id}" style="left:${point.x}px;top:${point.y}px;width:${COLUMN_WIDTH - NODE_INSET}px" title="${system.name} ${step}"><span>${shortName(system.name)}</span><small>${system.position || '–'}${system.planned ? ' ✎' : ''}</small></div>`
  })
  return html`${columns}<svg width="${width}" height="${model.height}">${paths}</svg>${nodes}`
}

