import { type Model } from './model'
import { html, raw, type Markup } from './markup'
import { buildFlow, type Direction, type FlowNode, type FlowTab } from './flowGraph'

type Shape = 'system' | 'component' | 'tag' | 'event' | 'port' | 'create'

const KIND_COLORS: Record<string, string> = {
  event: 'var(--event)', tag: 'var(--tag)', remove: 'var(--bad)', field: 'var(--field)', port: 'var(--port)', call: 'var(--muted)', system: 'var(--field)',
}
const STROKES: Record<string, string> = {
  field: 'var(--line-strong)', tag: 'var(--tag)', remove: 'var(--bad)', event: 'var(--event)', port: 'var(--port)', system: 'var(--line-strong)', center: 'var(--accent)',
}

function shapeOf(model: Model, id: string, node: FlowNode): Shape {
  if (/^(writer|reader|caller|callee):/.test(node.key)) return 'system'
  if (node.key === 'center') return model.units.get(id)!.kind === 'component' ? 'component' : 'system'
  if (node.key.includes(':event:')) return 'event'
  if (node.key.startsWith('out:port:')) return 'port'
  if (node.key.startsWith('out:create:')) return 'create'
  if (node.key.startsWith('out:tag:') || node.kind === 'tag') return 'tag'
  return 'component'
}

function outline(shape: Shape, x: number, y: number, width: number, height: number): Markup {
  if (shape === 'tag') return html`<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${height / 2}"/>`
  if (shape === 'event') return html`<path d="M${x + 10},${y} H${x + width} L${x + width - 10},${y + height} H${x} Z"/>`
  if (shape === 'port') return html`<path d="M${x},${y} H${x + width - 14} L${x + width},${y + height / 2} L${x + width - 14},${y + height} H${x} Z"/>`
  if (shape === 'create') return html`<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="3" stroke-dasharray="4 3"/>`
  if (shape === 'component') return html`<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="2"/><line class="table-line" x1="${x}" y1="${y + height / 2}" x2="${x + width}" y2="${y + height / 2}"/>`
  return html`<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="8"/>`
}

const clip = (text: string, length: number) => (text.length > length ? `${text.slice(0, length - 1)}…` : text)

export interface FlowView { tab: FlowTab; direction: Direction; only: Set<string> }

export function drawFlow(model: Model, container: HTMLElement, id: string, roomy: boolean, view: FlowView, focus: string | null = null): void {
  const built = buildFlow(model, id, view.tab, view.direction)
  const filterKind = (node: FlowNode) => ({ create: 'component' } as Record<string, string>)[shapeOf(model, id, node)] ?? shapeOf(model, id, node)
  const visible = (node: FlowNode) => node.key === 'center' || !view.only.size || view.only.has(filterKind(node))
  const columns = built.columns.map((column) => column.filter(visible))
  const keys = new Set(columns.flat().map((node) => node.key))
  const flow = { ...built, columns, links: built.links.filter((link) => keys.has(link.from) && keys.has(link.to)) }
  const touching = focus ? flow.links.filter((item) => item.from === focus || item.to === focus) : []
  const near = new Set([focus, ...touching.flatMap((item) => [item.from, item.to])])
  const nodeHeight = roomy ? 38 : 32
  const gap = roomy ? 10 : 6
  const count = flow.columns.length
  const available = container.clientWidth - 24
  const nodeWidth = Math.max(120, Math.min(roomy ? 220 : 180, (available - 40 - (count - 1) * 40) / count))
  const columnGap = Math.max(40, Math.min(roomy ? 120 : 80, (available - 40 - count * nodeWidth) / Math.max(1, count - 1)))
  const rows = Math.max(1, ...flow.columns.map((column) => column.length))
  const width = Math.max(available, count * nodeWidth + (count - 1) * columnGap + 40)
  const spacing = count > 1 ? (width - 40 - count * nodeWidth) / (count - 1) : 0
  const totalHeight = rows * (nodeHeight + gap) + 20
  const place = new Map<string, { x: number; y: number; node: FlowNode }>()
  flow.columns.forEach((column, index) => {
    const x = 20 + index * (nodeWidth + spacing)
    const top = 10 + (totalHeight - 10 - column.length * (nodeHeight + gap)) / 2
    column.forEach((node, row) => place.set(node.key, { x, y: top + row * (nodeHeight + gap), node }))
  })
  const heads = flow.heads.map((title, index) => (title ? html`<div class="flow-title" style="left:${20 + index * (nodeWidth + spacing)}px;width:${nodeWidth}px"><b>${title}</b></div>` : ''))
  const edges = flow.links.map((item) => {
    const from = place.get(item.from)
    const to = place.get(item.to)
    if (!from || !to) return ''
    const x1 = from.x + nodeWidth
    const y1 = from.y + nodeHeight / 2
    const x2 = to.x
    const y2 = to.y + nodeHeight / 2
    const middle = (x1 + x2) / 2
    const state = focus ? (touching.includes(item) ? ' lit' : ' dim') : ''
    return html`<path class="flow-edge${state}" stroke="${KIND_COLORS[item.kind]}"${item.dashed ? raw(' stroke-dasharray="5 5"') : ''} d="M${x1},${y1} C${middle},${y1} ${middle},${y2} ${x2},${y2}"/>`
  })
  const nodes = [...place.values()].map(({ x, y, node }) => {
    const shape = shapeOf(model, id, node)
    const inset = shape === 'event' || shape === 'tag' ? 14 : 10
    const state = focus ? (node.key === focus ? ' focused' : near.has(node.key) || node.kind === 'center' ? '' : ' dim') : ''
    const textY = node.sub ? (shape === 'component' ? y + nodeHeight / 2 - 4 : y + nodeHeight / 2 - 2) : y + nodeHeight / 2 + 4
    const subY = shape === 'component' ? y + nodeHeight - 5 : y + nodeHeight / 2 + 11
    return html`<g class="flow-node shape-${shape}${node.kind === 'center' ? ' center' : ''}${state}" data-key="${node.key}"${node.go ? html` data-go="${node.go}"` : ''} style="--stroke:${STROKES[node.kind]}"><title>${shape}: ${node.title}${node.sub ? ` · ${node.sub}` : ''}</title>${outline(shape, x, y, nodeWidth, nodeHeight)}<text x="${x + inset}" y="${textY}">${clip(node.title, Math.floor(nodeWidth / 8))}</text>${node.sub ? html`<text class="sub" x="${x + inset}" y="${subY}">${clip(node.sub, Math.floor(nodeWidth / 6.5))}</text>` : ''}</g>`
  })
  container.innerHTML = html`<div class="flow-heads" style="width:${width}px">${heads}</div><svg width="${width}" height="${totalHeight}">${edges}${nodes}</svg>`.markup
}
