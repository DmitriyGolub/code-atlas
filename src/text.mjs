import { impact } from './impact.mjs'

const at = (item) => `${item.file}:${item.line}`
const pad = (text, size) => String(text).padEnd(size)

export function impactText(model, name) {
  const result = impact(model, name)
  const step = (system) => system.position ? `step ${String(system.position).padStart(2)}` : 'unordered'
  const lines = [
    `# Impact of changing ${result.target.name}`, '',
    `Defined at ${at(result.target)} (${result.target.kind})`, '',
    `DIRECT CALLERS AND REFERENCES ${result.direct.length}`,
    ...result.direct.map((item) => `  ${pad(model.units.get(item.unit).name, 30)} ${at(item)}`), '',
    `TRANSITIVE DEPENDENCIES ${result.transitive.length}`,
    `FRAME SYSTEMS THAT EXECUTE IT ${result.executing.length}`,
    ...result.executing.map((system) => `  ${step(system)} ${pad(system.name, 26)} ${at(system)}`), '',
  ]
  if (result.target.kind === 'component') {
    lines.push(`WRITTEN BY ${result.writers.length}`)
    for (const writer of result.writers) {
      lines.push(`  ${step(writer.system)} ${writer.system.name}`)
      for (const access of writer.accesses) lines.push(`      ${pad(access.label, 26)} ${at(access)}`)
    }
    lines.push('')
  } else {
    lines.push(`WRITES ${[...result.fields, ...result.tags.map((tag) => `${tag} (tag)`), ...result.events.map((event) => `events.${event}`)].join(', ') || 'nothing'}`)
  }
  lines.push(
    `SYSTEMS THAT READ IT ${result.readers.length}`,
    ...result.readers.map((reader) => `  ${step(reader.system)} ${pad(reader.system.name, 26)} ${pad(at(reader.system), 60)} ${reader.through.join(', ')}`), '',
    `PUBLIC CONTRACTS ${result.contracts.length}`,
    ...result.contracts.map((unit) => `  ${pad(unit.name, 30)} ${at(unit)}`), '',
    `TESTS ${result.tests.length}`,
    ...result.tests.map((test) => `  ${test.title} (${at(test)})`),
    `SIMULATION TESTS THAT RUN THE FRAME ${result.simulationTests.length}`,
  )
  return lines.join('\n')
}

const shortName = (model, name) => name.replace(new RegExp(`${model.config.conventions.systemSuffix}$`), '')

export function focusText(model, name) {
  const suffix = model.config.conventions.systemSuffix
  const center = model.systems.find((system) => system.name === name || system.name === `${name}${suffix}`)
  if (!center) return impactText(model, name)
  const touching = model.edges.filter((edge) => !edge.hub && (edge.from === center.name || edge.to === center.name))
  const names = new Set([center.name, ...touching.flatMap((edge) => [edge.from, edge.to])])
  const list = (items, label = (item) => item.value) => [...new Map(items.map((item) => [label(item), item])).entries()].map(([text, item]) => `${text} (${at(item)})`).join(', ') || 'none'
  const grouped = new Map()
  for (const edge of touching) {
    const key = `${edge.from}>${edge.to}`
    grouped.set(key, { ...edge, labels: [...(grouped.get(key)?.labels ?? []), edge.via.replace('component:', '').replace('event:', 'events.')] })
  }
  return [
    `# ${center.name}`, '', ...(center.doc ? [center.doc, ''] : []), ...(center.planned ? ['Stub: data comes from the // criteria, not from code.', ''] : []),
    (center.position ? `- Frame step ${center.position} of ${model.frame.length}, ${at(center)}` : `- Not in the frame pipeline, ${at(center)}`),
    `- Queries ${[...new Set(center.facts.reads.filter((item) => item.value.endsWith('.query')).map((item) => item.via))].map((id) => model.units.get(id)).map((query) => `${query.name} = [${query.queryTerms?.join(', ')}]`).join('; ') || 'none'}`,
    `- Reads ${list(center.facts.reads.filter((item) => !item.value.endsWith('.query')))}`,
    `- Writes ${list(center.facts.writes)}`,
    `- Tags ${list([...center.facts.adds.map((item) => ({ ...item, value: `+${item.value}` })), ...center.facts.removes.map((item) => ({ ...item, value: `-${item.value}` }))])}`,
    `- Events ${list([...center.facts.eventWrites.map((item) => ({ ...item, value: `emits ${item.value}` })), ...center.facts.eventReads.map((item) => ({ ...item, value: `reads ${item.value}` }))])}`,
    `- Ports ${list(center.facts.ports)}`,
    `- Rules ${list(center.facts.rules, (item) => item.value.split('#')[1])}`,
    `- Creates ${list(center.facts.creates)}`,
    `- Tests ${model.tests.filter((test) => test.symbols.includes(center.id)).map((test) => `"${test.title}" (${at(test)})`).join(', ') || 'none call it directly'}`,
    '', '```mermaid', 'flowchart LR', `  ${center.name}[["${shortName(model, center.name)}<br/><small>${center.position ? `step ${center.position}` : 'unordered'}</small>"]]`,
    ...model.systems.filter((system) => names.has(system.name) && system !== center).map((system) => `  ${system.name}["${shortName(model, system.name)}<br/><small>${system.position ? `step ${system.position}` : 'unordered'}</small>"]`),
    ...[...grouped.values()].map((edge) => `  ${edge.from} ${edge.nextFrame ? '-.->' : '-->'}|${[...new Set(edge.labels)].slice(0, 3).join(', ')}| ${edge.to}`),
    '```',
  ].join('\n')
}

export function summaryText(model) {
  const lines = [`${model.systems.length} systems, ${model.units.size} symbols, ${model.edges.filter((edge) => !edge.hub).length} data links, ${model.tests.length} tests, ${model.findings.length} findings`]
  for (const finding of model.findings) lines.push(`  ${pad(finding.kind, 11)} ${pad(finding.system, 26)} ${pad(at(finding), 60)} ${finding.text}`)
  return lines.join('\n')
}
