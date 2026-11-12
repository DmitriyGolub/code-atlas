export function findIssues(project, units, { systems, systemByName, edges }) {
  const { config, absolute, insideAny } = project
  const { layers } = config
  const allReads = new Set()
  const allWrites = new Map()
  for (const unit of units.values()) {
    for (const item of unit.reads) allReads.add(item.value)
    for (const item of unit.writes) allWrites.set(item.value, [...(allWrites.get(item.value) ?? []), { ...item, unit: unit.id }])
  }
  const findings = []
  const ignored = (file) => config.findings.ignoreWriteOnlyIn.some((pattern) => file.includes(pattern))
  for (const [value, writers] of allWrites) {
    const [component, field] = value.split('.')
    if (field === '*' || allReads.has(value) || allReads.has(`${component}.*`)) continue
    const behaviour = writers.filter((item) => !ignored(item.file) && !insideAny(absolute(item.file), layers.entities))
    if (!behaviour.length) continue
    const owner = systems.find((system) => system.facts.writes.some((item) => item.value === value && item.file === behaviour[0].file))
    findings.push({ kind: 'write-only', system: owner?.name ?? units.get(behaviour[0].unit).name, file: behaviour[0].file, line: behaviour[0].line, text: `writes ${value}, but nothing reads this field` })
  }
  for (const system of systems) {
    const touched = new Set([...system.writeComponents, ...system.addTags])
    if (touched.size >= config.findings.wideSystem) findings.push({ kind: 'wide', system: system.name, file: system.file, line: system.line, text: `changes ${touched.size} components, consider splitting it` })
  }
  const lag = new Map()
  for (const edge of edges.filter((item) => item.nextFrame && !item.hub && item.kind !== 'field')) {
    if (edge.kind === 'tag' && !systemByName.get(edge.from).addTags.includes(edge.via.slice(10))) continue
    const forward = edges.some((other) => other.to === edge.to && other.via === edge.via && !other.nextFrame)
    const key = `${edge.to}|${edge.via}`
    if (!forward && !lag.has(key)) lag.set(key, edge)
  }
  for (const edge of lag.values()) {
    const reader = systemByName.get(edge.to)
    findings.push({ kind: 'next-frame', system: edge.to, file: reader.file, line: reader.line, text: `sees ${edge.via.replace('component:', '').replace('event:', 'events.')} one frame late (written by ${edge.from})` })
  }
  return findings
}
