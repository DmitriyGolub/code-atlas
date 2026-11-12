import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { analyze } from './analyze.mjs'
import { buildSpec } from './spec.mjs'

const FACTS = [
  ['reads', 'reads'],
  ['writes', 'writes'],
  ['adds', 'adds tag'],
  ['removes', 'removes tag'],
  ['eventReads', 'receives event'],
  ['eventWrites', 'emits event'],
  ['ports', 'port'],
  ['rules', 'calls rule'],
  ['creates', 'creates'],
]

const git = (root, ...parameters) => execFileSync('git', ['-C', root, ...parameters], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
const exists = (root, ref, path) => {
  try {
    git(root, 'cat-file', '-e', `${ref}:${path}`)
    return true
  } catch {
    return false
  }
}

export function specAt(config, ref) {
  const root = config.root
  const wanted = [...config.sources, ...config.tests, config.tsconfig, config.pipeline.file].filter((path) => exists(root, ref, path))
  const directory = mkdtempSync(join(tmpdir(), 'code-atlas-'))
  try {
    const archive = execFileSync('git', ['-C', root, 'archive', ref, '--', ...wanted], { maxBuffer: 1 << 30 })
    execFileSync('tar', ['-x', '-C', directory], { input: archive })
    if (existsSync(join(root, 'node_modules'))) symlinkSync(join(root, 'node_modules'), join(directory, 'node_modules'), 'dir')
    return buildSpec(analyze({ ...config, root: directory }))
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

const ruleName = (value) => value.split('#').pop()
const factSet = (system) => {
  const set = new Map()
  for (const [key, label] of FACTS) {
    for (const item of system[key] ?? []) {
      const value = key === 'rules' ? ruleName(item.value) : item.value
      set.set(`${label} ${value}`, { label, value, file: item.file, line: item.line })
    }
  }
  for (const query of system.queries ?? []) set.set(`query ${query.name} [${query.terms.join(', ')}]`, { label: 'query', value: `${query.name} [${query.terms.join(', ')}]`, file: query.file, line: query.line })
  return set
}
const component = (value) => value.split('.')[0]
const contractSet = (system) => {
  const set = new Map()
  const put = (label, value, item) => set.has(`${label} ${value}`) || set.set(`${label} ${value}`, { label, value, file: item.file, line: item.line })
  for (const item of system.reads ?? []) put('reads', component(item.value), item)
  for (const query of system.queries ?? []) for (const term of query.terms) if (!term.startsWith('Not(')) put('reads', term, query)
  for (const key of ['writes', 'adds', 'removes']) for (const item of system[key] ?? []) put('changes', component(item.value), item)
  for (const item of system.eventReads ?? []) put('receives event', item.value, item)
  for (const item of system.eventWrites ?? []) put('emits event', item.value, item)
  for (const item of system.ports ?? []) put('port', item.value.split('.')[0], item)
  for (const item of system.creates ?? []) put('creates', item.value, item)
  for (const key of [...set.keys()]) if (key.startsWith('reads ') && set.has(`changes ${key.slice(6)}`)) set.delete(key)
  return set
}
const minus = (first, second) => [...first.entries()].filter(([key]) => !second.has(key)).map(([, item]) => item)
const edgeKey = (edge) => `${edge.from}>${edge.to}>${edge.via}`

export function diffSpecs(before, after, accepted = []) {
  const isAccepted = (finding) => accepted.some((item) => item.kind === finding.kind && item.system === finding.system)
  const beforeSystems = new Map(before.systems.map((system) => [system.name, system]))
  const afterSystems = new Map(after.systems.map((system) => [system.name, system]))
  const added = after.systems.filter((system) => !beforeSystems.has(system.name))
  const removed = before.systems.filter((system) => !afterSystems.has(system.name))
  const changed = []
  const plan = []
  for (const system of after.systems) {
    const previous = beforeSystems.get(system.name)
    if (!previous) continue
    const now = factSet(system)
    const then = factSet(previous)
    const entry = { name: system.name, file: system.file, line: system.line, position: system.position, gained: minus(now, then), lost: minus(then, now) }
    if (previous.planned && !system.planned) {
      const code = contractSet(system)
      const planned = contractSet(previous)
      const lost = minus(planned, code).filter((item) => !(item.label === 'reads' && code.has(`changes ${item.value}`)))
      plan.push({ ...entry, gained: minus(code, planned), lost })
    }
    else if (entry.gained.length || entry.lost.length || previous.position !== system.position) changed.push({ ...entry, movedFrom: previous.position !== system.position ? previous.position : undefined })
  }
  const beforeEdges = new Map(before.edges.filter((edge) => !edge.hub).map((edge) => [edgeKey(edge), edge]))
  const afterEdges = new Map(after.edges.filter((edge) => !edge.hub).map((edge) => [edgeKey(edge), edge]))
  const findingKey = (finding) => `${finding.kind}|${finding.system}|${finding.text}`
  const beforeFindings = new Map(before.findings.map((finding) => [findingKey(finding), finding]))
  const afterFindings = new Map(after.findings.map((finding) => [findingKey(finding), finding]))
  return {
    systems: {
      added: added.map((system) => ({ name: system.name, file: system.file, line: system.line, position: system.position, planned: Boolean(system.planned), facts: [...factSet(system).values()] })),
      removed: removed.map((system) => ({ name: system.name, file: system.file, line: system.line })),
      changed,
    },
    plan,
    edges: { added: minus(afterEdges, beforeEdges), removed: minus(beforeEdges, afterEdges) },
    findings: {
      added: minus(afterFindings, beforeFindings).map((finding) => (isAccepted(finding) ? { ...finding, accepted: true } : finding)),
      removed: minus(beforeFindings, afterFindings),
    },
  }
}
