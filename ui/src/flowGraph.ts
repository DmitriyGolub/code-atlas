import { frameStep, shortName, type Model, excludedComponent } from './model'
import { kindLabel } from './kinds'

export type FlowKind = 'field' | 'tag' | 'remove' | 'event' | 'port' | 'system' | 'center' | 'call'
export interface FlowNode {
  key: string
  title: string
  sub: string
  kind: FlowKind
  go?: string
}

export interface FlowLink {
  from: string
  to: string
  kind: FlowKind
  dashed?: boolean
}

export interface Flow {
  columns: FlowNode[][]
  links: FlowLink[]
  heads: string[]
}

function buildDataFlow(model: Model, id: string): Flow {
  const unit = model.units.get(id)!
  const impact = model.spec.impacts[id]
  const columns: FlowNode[][] = []
  const links: FlowLink[] = []
  const push = (column: number, node: FlowNode) => {
    while (columns.length <= column) columns.push([])
    if (!columns[column].some((item) => item.key === node.key)) columns[column].push(node)
    return node.key
  }
  const link = (from: string, to: string, kind: FlowKind, dashed = false) => {
    if (!links.some((item) => item.from === from && item.to === to)) links.push({ from, to, kind, dashed })
  }
  const systemNode = (name: string, side: string): FlowNode => {
    const system = model.systemByName.get(name)
    return { key: `${side}:${name}`, title: shortName(name), sub: system?.position ? `#${system.position} in frame` : '', kind: 'system', go: model.idOf(name) }
  }
  const fieldsOf = (items: { value: string }[], component: string) =>
    [...new Set(items.filter((item) => item.value.split('.')[0] === component).map((item) => item.value.split('.')[1]))].filter((field) => field && field !== '*' && field !== 'query')

  if (unit.kind === 'system') {
    const system = model.systemByName.get(unit.name)!
    const center = push(2, { key: 'center', title: shortName(unit.name), sub: frameStep(model, system), kind: 'center' })
    const queried = new Set(system.queries.flatMap((query) => query.terms).filter((term) => !excludedComponent(term)))
    for (const component of new Set([...queried, ...system.reads.map((item) => item.value.split('.')[0])])) {
      const fields = fieldsOf(system.reads, component)
      const filterOnly = queried.has(component) && !fields.length
      link(push(1, { key: `in:${component}`, title: component, sub: fields.length ? `reads ${fields.join(' ')}` : filterOnly ? 'filter only, no data read' : '', kind: filterOnly ? 'tag' : 'field' }), center, 'field')
    }
    for (const event of new Set(system.eventReads.map((item) => item.value))) {
      link(push(1, { key: `in:event:${event}`, title: `events.${event}`, sub: 'event received', kind: 'event' }), center, 'event')
    }
    for (const edge of model.edges.filter((item) => item.to === unit.name)) {
      const target = edge.via.startsWith('event:') ? `in:event:${edge.via.slice(6)}` : `in:${edge.via.slice(10)}`
      if (!columns[1]?.some((node) => node.key === target)) continue
      link(push(0, systemNode(edge.from, 'writer')), target, edge.kind, edge.nextFrame)
    }
    const outputs = new Map<string, string>()
    for (const component of new Set(system.writes.map((item) => item.value.split('.')[0]))) {
      outputs.set(`component:${component}`, push(3, { key: `out:${component}`, title: component, sub: `writes ${fieldsOf(system.writes, component).join(' ')}`, kind: 'field' }))
    }
    for (const item of system.adds) outputs.set(`component:${item.value}`, outputs.get(`component:${item.value}`) ?? push(3, { key: `out:tag:${item.value}`, title: `+${item.value}`, sub: 'tag added', kind: 'tag' }))
    for (const item of system.removes) outputs.set(`component:${item.value}`, outputs.get(`component:${item.value}`) ?? push(3, { key: `out:tag:${item.value}`, title: `−${item.value}`, sub: 'tag removed', kind: 'remove' }))
    for (const item of system.eventWrites) outputs.set(`event:${item.value}`, push(3, { key: `out:event:${item.value}`, title: `events.${item.value}`, sub: 'event emitted', kind: 'event' }))
    for (const item of system.ports) push(3, { key: `out:port:${item.value}`, title: item.value, sub: `port: output to ${item.value.split('.')[0]}`, kind: 'port' })
    for (const item of system.creates) push(3, { key: `out:create:${item.value}`, title: `${item.value}()`, sub: 'creates an entity', kind: 'field' })
    for (const node of columns[3] ?? []) link(center, node.key, node.kind === 'remove' ? 'tag' : node.kind)
    for (const edge of model.edges.filter((item) => item.from === unit.name)) {
      const from = outputs.get(edge.via)
      if (from) link(from, push(4, systemNode(edge.to, 'reader')), edge.kind, edge.nextFrame)
    }
    return { columns, links, heads: ['Written by', 'Reads', '', 'Changes', 'Read by'] }
  }

  if (unit.kind === 'component') {
    const center = push(1, { key: 'center', title: unit.name, sub: 'component', kind: 'center' })
    for (const writer of impact?.writers ?? []) {
      const changed = [...new Set(writer.accesses.map((access) => access.value.replace(`${unit.name}.`, '')))].join(' ')
      link(push(0, { ...systemNode(writer.name, 'writer'), sub: changed }), center, writer.accesses.some((access) => /^[+-]/.test(access.value)) ? 'tag' : 'field')
    }
    for (const reader of impact?.readers ?? []) {
      link(center, push(2, { ...systemNode(reader.name, 'reader'), sub: reader.through.map((value) => value.replace(`${unit.name}.`, '')).join(' ') }), 'field')
    }
    return { columns, links, heads: ['Written by', '', 'Read by'] }
  }

  const center = push(1, { key: 'center', title: unit.name, sub: kindLabel(unit), kind: 'center' })
  for (const caller of unit.callers) link(push(0, { key: `caller:${caller.unit}`, title: caller.name, sub: model.units.has(caller.unit) ? kindLabel(model.units.get(caller.unit)!) : '', kind: 'system', go: model.units.has(caller.unit) ? caller.unit : undefined }), center, 'call')
  const written = new Map<string, string>()
  for (const field of impact?.writesFields ?? []) {
    const component = field.split('.')[0]
    const fields = impact.writesFields.filter((value) => value.startsWith(`${component}.`)).map((value) => value.split('.')[1])
    written.set(`component:${component}`, push(2, { key: `out:${component}`, title: component, sub: fields.join(' '), kind: 'field' }))
  }
  for (const tag of impact?.writesTags ?? []) written.set(`component:${tag}`, written.get(`component:${tag}`) ?? push(2, { key: `out:tag:${tag}`, title: tag, sub: 'tag', kind: 'tag' }))
  for (const event of impact?.emits ?? []) written.set(`event:${event}`, push(2, { key: `out:event:${event}`, title: `events.${event}`, sub: '', kind: 'event' }))
  for (const node of columns[2] ?? []) link(center, node.key, node.kind)
  for (const reader of impact?.readers ?? []) {
    for (const through of reader.through) {
      const isEvent = through.startsWith('events.')
      const from = written.get(isEvent ? `event:${through.slice(7)}` : `component:${through.split('.')[0].replace(' (tag)', '')}`)
      if (from) link(from, push(3, systemNode(reader.name, 'reader')), isEvent ? 'event' : 'field')
    }
  }
  return { columns, links, heads: ['Called by', '', 'Changes', 'Read by'] }
}

function buildCallFlow(model: Model, id: string): Flow {
  const unit = model.units.get(id)!
  const node = (side: string, entry: { unit: string; name: string }): FlowNode => ({ key: `${side}:${entry.unit}`, title: model.units.get(entry.unit)?.owner === id ? entry.name.split('.').pop()! : entry.name, sub: model.units.has(entry.unit) ? kindLabel(model.units.get(entry.unit)!) : '', kind: 'system', go: model.units.has(entry.unit) ? entry.unit : undefined })
  const distinct = (list: { unit: string; name: string }[]) => [...new Map(list.map((entry) => [entry.unit, entry])).values()]
  const callers = distinct(unit.callers).map((entry) => node('caller', entry))
  const members = model.membersOf(id).map((member) => ({ unit: member.id, name: member.name }))
  const calls = distinct(members.length ? members : unit.calls ?? []).map((entry) => node('callee', entry))
  const center: FlowNode = { key: 'center', title: shortName(unit.name), sub: kindLabel(unit), kind: 'center' }
  return {
    columns: [callers, [center], calls],
    links: [...callers.map((item) => ({ from: item.key, to: 'center', kind: 'call' as const })), ...calls.map((item) => ({ from: 'center', to: item.key, kind: 'call' as const }))],
    heads: [`Called by · ${callers.length}`, '', `${members.length ? 'Methods' : 'Calls'} · ${calls.length}`],
  }
}

export type FlowTab = 'data' | 'calls'
export type Direction = 'in' | 'both' | 'out'

export function buildFlow(model: Model, id: string, tab: FlowTab, direction: Direction): Flow {
  const flow = tab === 'calls' || model.mode === 'code' ? buildCallFlow(model, id) : buildDataFlow(model, id)
  const center = flow.columns.findIndex((column) => column.some((node) => node.key === 'center'))
  const keep = (index: number) => direction === 'both' || index === center || (direction === 'in' ? index < center : index > center)
  const columns = flow.columns.map((column, index) => (keep(index) ? column : []))
  const shown = new Set(columns.flat().map((node) => node.key))
  const kept = columns.map((column, index) => [column, flow.heads[index] ?? ''] as const).filter(([column], index) => column.length || index === center)
  return { columns: kept.map(([column]) => column), heads: kept.map(([, head]) => head), links: flow.links.filter((link) => shown.has(link.from) && shown.has(link.to)) }
}
