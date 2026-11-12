import { FACT_KEYS } from './units.mjs'

export const componentOf = (value) => value.split('.')[0]
const unique = (list) => [...new Set(list.map((item) => item.value))].sort()

export function buildFrame(config, units, componentNames, order) {
  const { conventions } = config
  const frame = [...order.simulation, ...order.view]

  const members = new Map()
  for (const unit of units.values()) if (unit.owner) members.set(unit.owner, [...(members.get(unit.owner) ?? []), unit])

  function closure(unit, seen = new Set()) {
    const facts = { ...Object.fromEntries(FACT_KEYS.map((key) => [key, []])), creates: [], rules: [] }
    if (seen.has(unit.id)) return facts
    seen.add(unit.id)
    for (const key of FACT_KEYS) facts[key].push(...unit[key].map((item) => ({ ...item, via: unit.id })))
    for (const member of members.get(unit.id) ?? []) {
      const inner = closure(member, seen)
      for (const key of Object.keys(facts)) facts[key].push(...inner[key])
    }
    for (const link of unit.queries) {
      const query = units.get(link.value)
      for (const term of query?.queryTerms ?? []) {
        const excluded = term.startsWith(`${conventions.excludeTerm}(`)
        const name = excluded ? term.slice(conventions.excludeTerm.length + 1, -1) : term
        if (componentNames.has(name)) facts.reads.push({ value: `${name}.query`, file: query.file, line: query.line, via: query.id, excluded })
      }
    }
    for (const link of [...unit.calls, ...unit.references]) {
      const target = units.get(link.value)
      if (!target || target.kind === 'system') continue
      if (target.kind === 'entity') {
        facts.creates.push({ value: target.name, file: link.file, line: link.line })
        continue
      }
      facts.rules.push({ value: target.id, file: link.file, line: link.line })
      const inner = closure(target, seen)
      for (const key of Object.keys(facts)) facts[key].push(...inner[key])
    }
    return facts
  }

  const unique = (list) => [...new Set(list.map((item) => item.value))].sort()
  const systems = [...units.values()].filter((unit) => unit.kind === 'system').map((unit) => {
    const facts = closure(unit)
    return {
      ...unit, domain: unit.file.split('/').at(-2), position: frame.indexOf(unit.name) + 1, phase: order.view.includes(unit.name) ? 'view' : 'simulation',
      mode: order.modes.get(unit.name) ?? 'all', facts,
      readComponents: unique(facts.reads.filter((item) => !item.excluded).map((item) => ({ value: componentOf(item.value) }))),
      excludedComponents: unique(facts.reads.filter((item) => item.excluded).map((item) => ({ value: componentOf(item.value) }))), writeComponents: unique(facts.writes.map((item) => ({ value: componentOf(item.value) }))),
      addTags: unique(facts.adds), removeTags: unique(facts.removes), emits: unique(facts.eventWrites), listens: unique(facts.eventReads),
    }
  }).sort((first, second) => (first.position || Infinity) - (second.position || Infinity) || first.name.localeCompare(second.name))
  const systemByName = new Map(systems.map((system) => [system.name, system]))

  const readersOf = new Map()
  const addReader = (key, name) => readersOf.set(key, [...(readersOf.get(key) ?? []), name])
  for (const system of systems) {
    for (const component of system.readComponents) addReader(`component:${component}`, system.name)
    for (const component of system.excludedComponents) if (!system.readComponents.includes(component)) addReader(`component:${component}`, `!${system.name}`)
    for (const event of system.listens) addReader(`event:${event}`, system.name)
  }
  const hubs = new Set([...readersOf.entries()].filter(([key, readers]) => key.startsWith('component:') && readers.length > config.findings.hubReaders).map(([key]) => key))
  const edges = []
  for (const writer of systems) {
    const produced = new Map()
    for (const item of writer.facts.writes) produced.set(`component:${componentOf(item.value)}`, 'field')
    for (const item of [...writer.facts.adds, ...writer.facts.removes]) produced.set(`component:${item.value}`, 'tag')
    for (const item of writer.facts.eventWrites) produced.set(`event:${item.value}`, 'event')
    for (const [key, kind] of produced) {
      for (const entry of readersOf.get(key) ?? []) {
        const excluded = entry.startsWith('!')
        const reader = excluded ? entry.slice(1) : entry
        if (reader !== writer.name) edges.push({ from: writer.name, to: reader, via: key, kind, hub: hubs.has(key), nextFrame: systemByName.get(reader).position > 0 && writer.position > 0 && systemByName.get(reader).position < writer.position, ...(excluded ? { excluded: true } : {}) })
      }
    }
  }

  return { frame, closure, systems, systemByName, edges }
}
