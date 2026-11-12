export function findUnit(model, name) {
  const suffix = model.config.conventions.systemSuffix
  const candidates = [...model.units.values()].filter((unit) => unit.name === name || unit.name === `${name}${suffix}` || unit.id === name)
  return candidates.find((unit) => unit.kind === 'system') ?? candidates.find((unit) => unit.kind !== 'outside') ?? candidates[0] ?? null
}

export function impact(model, name) {
  const target = findUnit(model, name)
  if (!target) throw new Error(`No symbol named ${name}`)
  const { units, systems, callersOf, closure, componentOf, tests } = model
  const direct = callersOf.get(target.id) ?? []
  const transitive = new Set()
  const queue = [target.id]
  while (queue.length) {
    const current = queue.shift()
    const unit = units.get(current)
    if (current !== target.id && (unit?.kind === 'system' || unit?.file === model.pipelineFile)) continue
    for (const caller of callersOf.get(current) ?? []) {
      if (transitive.has(caller.unit)) continue
      transitive.add(caller.unit)
      queue.push(caller.unit)
    }
  }
  const executing = [...transitive, target.id].map((id) => units.get(id)).filter((unit) => unit?.kind === 'system').map((unit) => model.systemByName.get(unit.name)).filter(Boolean)
  const contracts = [...transitive].map((id) => units.get(id)).filter((unit) => unit && model.isOutside(unit.file))
  const own = target.kind === 'component' ? null : closure(target)
  const fields = own ? [...new Set(own.writes.map((item) => item.value))] : []
  const tags = own ? [...new Set([...own.adds, ...own.removes].map((item) => item.value))] : [target.name]
  const events = own ? [...new Set(own.eventWrites.map((item) => item.value))] : []
  const readsField = (system, field) => {
    const component = componentOf(field)
    return system.facts.reads.some((item) => item.value === field || item.value === `${component}.*` || (field.endsWith('.*') && item.value.startsWith(`${component}.`)))
  }
  const readsTag = (system, tag) => system.facts.reads.some((item) => componentOf(item.value) === tag)
  const readers = systems
    .filter((system) => system.name !== target.name && !executing.includes(system))
    .map((system) => ({ system, through: [...fields.filter((field) => readsField(system, field)), ...tags.filter((tag) => readsTag(system, tag)), ...events.filter((event) => system.listens.includes(event)).map((event) => `events.${event}`)] }))
    .filter((reader) => reader.through.length)
  const writers = target.kind !== 'component' ? [] : systems.map((system) => ({
    system,
    accesses: [
      ...system.facts.writes.filter((item) => componentOf(item.value) === target.name).map((item) => ({ ...item, label: item.value })),
      ...system.facts.adds.filter((item) => item.value === target.name).map((item) => ({ ...item, label: `+${item.value}` })),
      ...system.facts.removes.filter((item) => item.value === target.name).map((item) => ({ ...item, label: `-${item.value}` })),
    ],
  })).filter((writer) => writer.accesses.length)
  const touched = new Set([target.id, ...transitive])
  const directTests = tests.filter((test) => test.symbols.some((id) => touched.has(id)))
  const simulationTests = executing.length || readers.length ? tests.filter((test) => test.simulates && !directTests.includes(test)) : []
  return { target, direct, transitive: [...transitive], executing, contracts, fields, tags, events, readers, writers, tests: directTests, simulationTests }
}
