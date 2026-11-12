import { impact } from './impact.mjs'

export const FORMAT_VERSION = '1.0'
const byText = (first, second) => (first > second ? 1 : first < second ? -1 : 0)
const at = (item) => ({ file: item.file, line: item.line })

export function buildSpec(model, { fresh = [] } = {}) {
  const { units, systems } = model
  const plain = (unit) => ({
    id: unit.id, name: unit.name, kind: unit.kind, file: unit.file, line: unit.line, lines: unit.lines, complexity: unit.complexity,
    ...(unit.exported ? { exported: true } : {}), ...(unit.doc ? { doc: unit.doc } : {}), ...(unit.planned ? { planned: true } : {}),
    ...(unit.decorators ? { decorators: unit.decorators } : {}), ...(unit.owner ? { owner: unit.owner } : {}),
  })
  const spec = {
    $schema: './code-atlas.schema.json',
    codeAtlas: FORMAT_VERSION,
    sourceDigest: model.sourceDigest,
    frame: model.frame,
    ...(fresh.length ? { fresh } : {}),
    systems: systems.map((system) => ({
      ...plain(system), domain: system.domain, position: system.position, phase: system.phase, mode: system.mode,
      queries: [
        ...[...new Set(system.facts.reads.filter((item) => item.value.endsWith('.query')).map((item) => item.via))].map((id) => units.get(id)).filter((query) => query?.kind === 'query').map((query) => ({ name: query.name, terms: query.queryTerms ?? [], ...at(query) })),
        ...[...units.values()].filter((unit) => unit.id === system.id || unit.owner === system.id).flatMap((unit) => unit.apiQueries ?? []),
      ],
      reads: system.facts.reads.filter((item) => !item.value.endsWith('.query')),
      writes: system.facts.writes, adds: system.facts.adds, removes: system.facts.removes,
      eventReads: system.facts.eventReads, eventWrites: system.facts.eventWrites, ports: system.facts.ports,
      rules: system.facts.rules, creates: system.facts.creates,
    })),
    units: [...units.values()].filter((unit) => !['outside', 'config'].includes(unit.kind) || unit.exported).map((unit) => ({
      ...plain(unit),
      callers: (model.callersOf.get(unit.id) ?? []).map((item) => ({ unit: item.unit, name: units.get(item.unit).name, ...at(item) })),
      calls: [...unit.calls, ...unit.references].map((item) => ({ unit: item.value, name: units.get(item.value).name, ...at(item) })),
    })).sort((first, second) => byText(first.id, second.id)),
    edges: [...model.edges].sort((first, second) => byText(`${first.from}>${first.to}>${first.via}`, `${second.from}>${second.to}>${second.via}`)),
    findings: [...model.findings].sort((first, second) => byText(`${first.kind}${first.system}${first.text}`, `${second.kind}${second.system}${second.text}`)),
    tests: model.tests,
  }
  spec.impacts = Object.fromEntries(spec.units.filter((unit) => ['system', 'rule', 'entity', 'component'].includes(unit.kind)).map((unit) => {
    const result = impact(model, unit.id)
    return [unit.id, {
      executing: result.executing.map((system) => system.name),
      readers: result.readers.map((reader) => ({ name: reader.system.name, through: reader.through })),
      writers: result.writers.map((writer) => ({ name: writer.system.name, accesses: writer.accesses.map((item) => ({ value: item.label, ...at(item) })) })),
      contracts: result.contracts.map((item) => ({ name: item.name, ...at(item) })),
      writesFields: result.fields, writesTags: result.tags, emits: result.events,
      tests: result.tests.map((test) => ({ title: test.title, ...at(test) })),
      simulationTests: result.simulationTests.length, transitive: result.transitive.length,
    }]
  }))
  return spec
}

export const serialize = (spec) => `${JSON.stringify(spec, null, 1)}\n`
