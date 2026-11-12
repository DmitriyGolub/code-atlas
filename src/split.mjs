import { createHash } from 'node:crypto'
import { join, relative, sep } from 'node:path'
import { childFolders, workspaceFolders } from './files.mjs'
import { serialize } from './spec.mjs'

export const SINGLE_FILE = 'code-atlas.json'
export const INDEX_FILE = 'index.json'
export const MODULES_FOLDER = 'modules'
const ROOT_MODULE = '.'
const DIGEST_LENGTH = 16

const toProject = (root, path) => relative(root, path).split(sep).join('/')
const expand = (root, pattern) => (pattern.endsWith('/*') ? childFolders(join(root, pattern.slice(0, -2))).map((path) => toProject(root, path)) : [pattern])

export function moduleRoots(config) {
  if (!config.split) return null
  const patterns = Array.isArray(config.split) ? config.split
    : (workspaceFolders(config.root).length ? workspaceFolders(config.root) : config.sources).map((folder) => `${folder}/*`)
  return [...new Set(patterns.flatMap((pattern) => expand(config.root, pattern)))].sort((first, second) => second.length - first.length || first.localeCompare(second))
}

const fileNameOf = (path) => `${path === ROOT_MODULE ? 'root' : path.replace(/[^\w.-]+/g, '.')}.json`
const digestOf = (text) => createHash('sha1').update(text).digest('hex').slice(0, DIGEST_LENGTH)

export function splitSpec(spec, roots) {
  const moduleOf = (file) => roots.find((root) => file === root || file.startsWith(`${root}/`)) ?? ROOT_MODULE
  const unitModule = new Map(spec.units.map((unit) => [unit.id, moduleOf(unit.file)]))
  const systemModule = new Map(spec.systems.map((system) => [system.name, moduleOf(system.file)]))
  const modules = new Map()
  const bucket = (path) => modules.get(path) ?? modules.set(path, { systems: [], units: [], edges: [], findings: [], tests: [], impacts: {} }).get(path)
  for (const system of spec.systems) bucket(moduleOf(system.file)).systems.push(system)
  for (const unit of spec.units) bucket(unitModule.get(unit.id)).units.push(unit)
  for (const edge of spec.edges) bucket(systemModule.get(edge.from) ?? ROOT_MODULE).edges.push(edge)
  for (const finding of spec.findings) bucket(moduleOf(finding.file)).findings.push(finding)
  for (const test of spec.tests) bucket(moduleOf(test.file)).tests.push(test)
  for (const [id, impact] of Object.entries(spec.impacts)) bucket(unitModule.get(id) ?? ROOT_MODULE).impacts[id] = impact
  const links = new Map()
  for (const unit of spec.units) for (const caller of unit.callers) {
    const from = unitModule.get(caller.unit)
    const to = unitModule.get(unit.id)
    if (from && from !== to) links.set(`${from}>${to}`, (links.get(`${from}>${to}`) ?? 0) + 1)
  }
  const files = [...modules].sort(([first], [second]) => first.localeCompare(second)).map(([path, content]) => {
    const text = serialize({ codeAtlas: spec.codeAtlas, module: path, ...content })
    return { path, file: `${MODULES_FOLDER}/${fileNameOf(path)}`, text, counts: { units: content.units.length, systems: content.systems.length, tests: content.tests.length } }
  })
  const index = {
    $schema: spec.$schema, codeAtlas: spec.codeAtlas, sourceDigest: spec.sourceDigest, frame: spec.frame, ...(spec.fresh ? { fresh: spec.fresh } : {}),
    modules: files.map(({ path, file, text, counts }) => ({ path, file, digest: digestOf(text), ...counts })),
    links: [...links].map(([key, calls]) => { const [from, to] = key.split('>'); return { from, to, calls } }).sort((first, second) => second.calls - first.calls || first.from.localeCompare(second.from)),
  }
  return [{ file: INDEX_FILE, text: serialize(index) }, ...files.map(({ file, text }) => ({ file, text }))]
}

export function outputsOf(config, spec) {
  const roots = moduleRoots(config)
  return roots ? splitSpec(spec, roots) : [{ file: SINGLE_FILE, text: serialize(spec) }]
}
