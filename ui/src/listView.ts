import { html, type Markup } from './markup'
import { shortName, type Model } from './model'
import type { IconName } from './icons'
import { kindLabel } from './kinds'

export type View = 'graph' | 'tree' | 'modules' | 'systems' | 'components' | 'events' | 'symbols'
export interface Sorting { column: number; descending: boolean }
type Cell = string | number
interface Row { go?: string; cells: Cell[] }

const LIMIT = 600

export const viewsOf = (model: Model): [View, string, IconName][] => {
  const views: [View, string, IconName][] = model.mode === 'frame'
    ? [['graph', 'Graph', 'graph'], ['tree', 'Tree', 'folder'], ['systems', 'Systems', 'cpu'], ['components', 'Components', 'box'], ['events', 'Events', 'bolt'], ['symbols', 'Symbols', 'code']]
    : [['graph', 'Graph', 'graph'], ['tree', 'Tree', 'folder'], ['symbols', 'Symbols', 'code']]
  return model.spec.modules ? [...views.slice(0, 2), ['modules', 'Modules', 'box'], ...views.slice(2)] : views
}

function table(model: Model, view: View): { heads: string[]; rows: Row[] } {
  const { spec, systems } = model
  if (view === 'systems') return { heads: ['System', 'Domain', 'Step', 'Reads', 'Writes', 'Findings'], rows: systems.map((system) => ({ go: system.id, cells: [shortName(system.name), system.domain, system.position || '–', new Set(system.reads.map((item) => item.value.split('.')[0])).size, new Set(system.writes.map((item) => item.value.split('.')[0])).size, spec.findings.filter((finding) => finding.system === system.name).length] })) }
  if (view === 'components') return { heads: ['Component', 'Written by', 'Read by', 'File'], rows: spec.units.filter((unit) => unit.kind === 'component').map((unit) => ({ go: unit.id, cells: [unit.name, spec.impacts[unit.id]?.writers.length ?? 0, spec.impacts[unit.id]?.readers.length ?? 0, unit.file] })) }
  if (view === 'modules') {
    const links = spec.links ?? []
    const total = (path: string, side: 'from' | 'to') => links.filter((link) => link[side] === path).reduce((sum, link) => sum + link.calls, 0)
    const uses = (path: string) => links.filter((link) => link.from === path).slice(0, 3).map((link) => `${link.to} (${link.calls})`).join(', ')
    return { heads: ['Module', 'Symbols', 'Tests', 'Calls out', 'Calls in', 'Uses most'], rows: (spec.modules ?? []).map((module) => ({ cells: [module.path, module.units, module.tests, total(module.path, 'from'), total(module.path, 'to'), uses(module.path)] })) }
  }
  if (view === 'events') {
    const names = [...new Set(systems.flatMap((system) => [...system.eventReads, ...system.eventWrites].map((item) => item.value)))]
    const who = (name: string, side: 'eventWrites' | 'eventReads') => systems.filter((system) => system[side].some((item) => item.value === name)).map((system) => shortName(system.name)).join(', ')
    return { heads: ['Event', 'Emitted by', 'Read by'], rows: names.map((name) => ({ cells: [`events.${name}`, who(name, 'eventWrites'), who(name, 'eventReads')] })) }
  }
  return { heads: ['Symbol', 'Kind', 'Callers', 'Calls', 'Tests', 'Lines', 'Complexity', 'File'], rows: spec.units.map((unit) => ({ go: unit.id, cells: [unit.name, kindLabel(unit), unit.callers.length, unit.calls?.length ?? 0, model.testsOf(unit.id).length, unit.lines ?? 0, unit.complexity ?? 0, unit.file] })) }
}

const compare = (first: Cell, second: Cell) => (typeof first === 'number' && typeof second === 'number' ? first - second : String(first).localeCompare(String(second)))

export function renderList(model: Model, view: View, sorting: Sorting, selected: string | null): Markup {
  const { heads, rows } = table(model, view)
  const sorted = [...rows].sort((first, second) => compare(first.cells[sorting.column], second.cells[sorting.column]) * (sorting.descending ? -1 : 1))
  const marker = (index: number) => (index === sorting.column ? (sorting.descending ? ' ↓' : ' ↑') : '')
  return html`<table><thead><tr>${heads.map((head, index) => html`<th data-sort="${index}" class="${index === sorting.column ? 'sorted' : ''}">${head}${marker(index)}</th>`)}</tr></thead>
<tbody>${sorted.slice(0, LIMIT).map((row) => html`<tr${row.go ? html` data-go="${row.go}"` : ''} class="${row.go && row.go === selected ? 'current' : ''}">${row.cells.map((cell) => html`<td title="${cell}">${cell}</td>`)}</tr>`)}</tbody></table>
${sorted.length > LIMIT ? html`<p class="hint">Showing ${LIMIT} of ${sorted.length}. Search to find the rest.</p>` : ''}`
}
