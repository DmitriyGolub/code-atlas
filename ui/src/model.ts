import type { Access, Edge, EditorName, Location, Spec, System, Test, Unit } from './types'
import { html, type Markup } from './markup'
import { registerClasses } from './kinds'

export const COLUMN_WIDTH = 170
export const ROW_HEIGHT = 36

const EDITORS: Record<EditorName, string> = {
  vscode: 'vscode://file/{path}:{line}',
  cursor: 'cursor://file/{path}:{line}',
  webstorm: 'webstorm://open?file={path}&line={line}',
  zed: 'zed://file/{path}:{line}',
}

export interface Model {
  spec: Spec
  mode: 'frame' | 'code'
  codeNodes: Unit[]
  systems: System[]
  systemByName: Map<string, System>
  units: Map<string, Unit>
  domains: string[]
  layout: Map<string, { x: number; y: number }>
  height: number
  fresh: Set<string>
  flagged: Set<string>
  allEdges: Edge[]
  edges: Edge[]
  idOf(name: string): string | undefined
  testsOf(id: string): Test[]
  membersOf(id: string): Unit[]
  href(item: Location): string
  source(item: Location): Markup
}

export function createModel(spec: Spec, root = '', editor: EditorName = 'vscode'): Model {
  const systems = spec.systems
  const systemByName = new Map(systems.map((system) => [system.name, system]))
  const units = new Map(spec.units.map((unit) => [unit.id, unit]))
  const domains = [...new Set(systems.map((system) => system.domain))]
  const layout = new Map<string, { x: number; y: number }>()
  domains.forEach((domain, column) => {
    systems.filter((system) => system.domain === domain).forEach((system, row) => layout.set(system.name, { x: column * COLUMN_WIDTH, y: 30 + row * ROW_HEIGHT }))
  })
  const allEdges = spec.edges.filter((edge) => !edge.hub)
  const members = new Map<string, Unit[]>()
  for (const unit of spec.units) if (unit.owner) members.set(unit.owner, [...(members.get(unit.owner) ?? []), unit])
  registerClasses(spec.units)
  const tests = new Map<string, Test[]>()
  for (const test of spec.tests) for (const symbol of test.symbols ?? []) tests.set(symbol, [...(tests.get(symbol) ?? []), test])
  const pattern = EDITORS[editor] ?? EDITORS.vscode
  const href = (item: Location) => (root ? pattern.replace('{path}', `${root}/${item.file}`).replace('{line}', String(item.line)) : '#')
  return {
    spec,
    mode: systems.length ? 'frame' : 'code',
    codeNodes: [],
    systems,
    systemByName,
    units,
    domains,
    layout,
    height: Math.max(0, ...[...layout.values()].map((point) => point.y)) + 60,
    fresh: new Set(spec.fresh ?? []),
    flagged: new Set(spec.findings.map((finding) => finding.system)),
    allEdges,
    edges: allEdges.filter((edge) => !edge.excluded),
    testsOf: (id) => tests.get(id) ?? [],
    membersOf: (id) => members.get(id) ?? [],
    idOf: (name) => systemByName.get(name)?.id ?? spec.units.find((unit) => unit.name === name)?.id,
    href,
    source: (item) => html`<a class="source" href="${href(item)}" title="${item.file}:${item.line}">${item.file.split('/').slice(-2).join('/')}:${item.line}</a>`,
  }
}

const EXCLUDED_TERM = /^not\((.*)\)$/i
export const excludedComponent = (term: string): string | null => term.match(EXCLUDED_TERM)?.[1] ?? null

export const shortName = (name: string): string => name.replace(/System$/, '')

export const viaText = (via: string): string => via.replace('component:', '').replace('event:', 'events.')

export const firstPerValue = <Item extends { value: string }>(items: Item[]): Item[] => [...new Map(items.map((item) => [item.value, item])).values()]

export const componentsOf = (items: { value: string }[]): string[] => [...new Set(items.map((item) => item.value.split('.')[0]))]

export const frameStep = (model: Model, system: System): string =>
  system.position ? `#${system.position} of ${model.spec.frame.length} in frame` : 'not in the frame pipeline'

export interface Related {
  name: string
  vias: Set<string>
}

export function relations(model: Model, id: string): { upstream: Related[]; downstream: Related[] } {
  const unit = model.units.get(id)!
  const impact = model.spec.impacts[id]
  const group = (list: Edge[], key: 'from' | 'to') => {
    const byName = new Map<string, Related>()
    for (const edge of list) {
      if (!byName.has(edge[key])) byName.set(edge[key], { name: edge[key], vias: new Set() })
      byName.get(edge[key])!.vias.add(viaText(edge.via))
    }
    return [...byName.values()]
  }
  const readers = (impact?.readers ?? []).map((reader) => ({ name: reader.name, vias: new Set(reader.through) }))
  if (unit.kind === 'system') {
    return { upstream: group(model.edges.filter((edge) => edge.to === unit.name), 'from'), downstream: group(model.edges.filter((edge) => edge.from === unit.name), 'to') }
  }
  if (unit.kind === 'component') {
    return { upstream: (impact?.writers ?? []).map((writer) => ({ name: writer.name, vias: new Set(writer.accesses.map((access: Access) => access.value)) })), downstream: readers }
  }
  return { upstream: unit.callers.map((caller) => ({ name: caller.name, vias: new Set(['calls']) })), downstream: readers }
}
