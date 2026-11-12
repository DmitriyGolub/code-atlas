import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, dirname, join, relative, sep } from 'node:path'
import { DEFAULT_CONFIG, WORLD_API_CONVENTIONS } from './config.mjs'
import { isDirectory, listSources, workspaceFolders } from './files.mjs'

const DETECTION = {
  sourceFolder: 'src',
  extraSkipped: ['docs'],
  componentFolders: ['components', 'component'],
  systemFolders: ['systems', 'system'],
  entityFolders: ['entities', 'entity'],
  configFolders: ['config', 'configs'],
  testHelperFolder: 'support',
  componentHint: /new (Float32|Float64|Int8|Int16|Int32|Uint8|Uint16|Uint32)Array\(|defineComponent\(|\[\] as \w+\[\]|class \w+Component\b/,
  systemExport: /export (?:default )?(?:const|function|class) \w+System\b/,
  worldRead: /\.getComponent\(/,
  registerCall: /\.addSystem\(\s*new\s/g,
  registerMethod: 'addSystem',
  minimumRegistrations: 2,
  systemName: /\w+System\b/g,
  pipelineArray: /(?:const|let)\s+(\w+)(?:\s*:[^=\n]+)?\s*=\s*\[([^\]]*)\]/g,
  pipelineCall: /(?:const|let)\s+(\w+)\s*=\s*\w+\(\s*\[/g,
  viewName: /view|render/i,
  pipelineSuffix: /pipeline$/i,
  minimumSystemsInPipeline: 2,
  defaultMode: 'run',
  inlineQueryFactory: 'query',
}

const commonParent = (paths) => paths.reduce((common, path) => { while (!(path + sep).startsWith(common + sep)) common = dirname(common); return common })
const count = (text, pattern) => (text.match(pattern) ?? []).length

function readProject(root) {
  const workspaces = workspaceFolders(root)
  const sourceRoot = existsSync(join(root, DETECTION.sourceFolder)) ? join(root, DETECTION.sourceFolder) : root
  const directories = []
  const files = listSources(sourceRoot, [...DEFAULT_CONFIG.skipFolders, ...DETECTION.extraSkipped], (path) => directories.push(path))
  return { workspaces, sourceRoot, directories, files, text: new Map(files.map((file) => [file, readFileSync(file, 'utf8')])) }
}

function detectTests(root, { files }) {
  const testPattern = new RegExp(DEFAULT_CONFIG.testPattern)
  const folders = DEFAULT_CONFIG.testFolders.filter((name) => isDirectory(join(root, name)))
  const colocated = files.filter((file) => testPattern.test(file)).length
  const found = [...folders.map((name) => `${name}/`), ...(colocated ? [`${colocated} test files next to the code`] : [])]
  return {
    config: { tests: folders, testHelpers: folders.map((name) => `${name}/${DETECTION.testHelperFolder}`).filter((path) => isDirectory(join(root, path))) },
    report: `tests: ${found.join(', ') || 'none found'}`,
  }
}

function detectLayers(project, toProject) {
  const { directories, files, text, sourceRoot } = project
  const filesIn = (directory) => files.filter((file) => file.startsWith(directory + sep))
  const best = (names, pattern) => directories
    .filter((path) => names.includes(basename(path)))
    .map((path) => ({ path, score: filesIn(path).filter((file) => pattern.test(text.get(file))).length }))
    .filter((candidate) => candidate.score > 0)
    .sort((first, second) => second.score - first.score || first.path.length - second.path.length)[0]?.path
  const components = best(DETECTION.componentFolders, DETECTION.componentHint)
  const systems = best(DETECTION.systemFolders, DETECTION.systemExport)
  if (!components || !systems) return null
  const hasHelpers = (path) => [...DETECTION.entityFolders, ...DETECTION.configFolders].some((name) => isDirectory(join(path, name)))
  let game = commonParent([components, systems])
  for (let path = game; path.startsWith(sourceRoot) && path !== sourceRoot; path = dirname(path)) if (hasHelpers(path)) { game = path; break }
  const sibling = (names) => names.map((name) => join(game, name)).filter(isDirectory).map(toProject)
  const outside = readdirSync(sourceRoot).map((name) => join(sourceRoot, name))
    .filter((path) => isDirectory(path) && !DEFAULT_CONFIG.skipFolders.includes(basename(path)) && path !== game && !(game + sep).startsWith(path + sep))
  return { game, layers: { components: toProject(components), systems: toProject(systems), entities: sibling(DETECTION.entityFolders), config: sibling(DETECTION.configFolders), game: toProject(game), outside: outside.map(toProject) } }
}

function detectRegistration({ files, text }, toProject) {
  const candidates = files.map((file) => ({ file, calls: count(text.get(file), DETECTION.registerCall) }))
    .filter((candidate) => candidate.calls >= DETECTION.minimumRegistrations)
    .sort((first, second) => second.calls - first.calls)
  if (!candidates.length) return null
  const file = toProject(candidates[0].file)
  return { pipeline: { file, entries: [], view: null, modes: {}, register: DETECTION.registerMethod }, report: `frame: ${candidates[0].calls} world.${DETECTION.registerMethod} calls in ${file}` }
}

function detectPipeline({ files, text }, game, toProject) {
  const testPattern = new RegExp(DEFAULT_CONFIG.testPattern)
  const isPipeline = (match) => count(match[2], DETECTION.systemName) >= DETECTION.minimumSystemsInPipeline
  const candidates = files.filter((file) => !testPattern.test(file) && file.startsWith(game + sep))
    .map((file) => ({ file, arrays: [...text.get(file).matchAll(DETECTION.pipelineArray)].filter(isPipeline).length }))
    .filter((candidate) => candidate.arrays > 0)
    .sort((first, second) => second.arrays - first.arrays)
  if (!candidates.length) return { pipeline: { file: '', entries: [], view: null, modes: {} }, report: 'frame: no array of systems found, systems are shown without an order' }
  const source = text.get(candidates[0].file)
  const arrays = [...new Set([...source.matchAll(DETECTION.pipelineArray)].filter((match) => count(match[2], DETECTION.systemName) > 0).map((match) => match[1]))]
  const view = arrays.find((name) => DETECTION.viewName.test(name)) ?? null
  const entries = [...new Set([...[...source.matchAll(DETECTION.pipelineCall)].map((match) => match[1]), ...arrays.filter((name) => name !== view)])]
  const modes = entries.length > 1 ? Object.fromEntries(entries.map((name) => [name, name.replace(DETECTION.pipelineSuffix, '').toLowerCase() || DETECTION.defaultMode])) : {}
  return { pipeline: { file: toProject(candidates[0].file), entries, view, modes }, report: `frame: ${entries.join(', ')}${view ? `, view ${view}` : ''} in ${toProject(candidates[0].file)}` }
}

export function detectConfig(root) {
  const toProject = (path) => relative(root, path).split(sep).join('/') || '.'
  const project = readProject(root)
  const report = []
  const config = {}
  if (project.workspaces.length) {
    config.sources = project.workspaces
    report.push(`workspaces: ${project.workspaces.join(', ')}. For a large map set "split": "auto" to write one file per package`)
  }
  else if (project.sourceRoot === root) config.sources = ['.']
  const tests = detectTests(root, project)
  Object.assign(config, tests.config)
  report.push(tests.report)
  const ecs = detectLayers(project, toProject)
  if (!ecs) return { config, report: [...report, 'ecs: no components and systems folders with ECS code, the map shows calls between functions'] }
  config.layers = ecs.layers
  report.push(`ecs: components ${ecs.layers.components}, systems ${ecs.layers.systems}, game ${ecs.layers.game}`)
  const usesWorldApi = [...project.text.values()].some((source) => DETECTION.worldRead.test(source))
  if (usesWorldApi) report.push('ecs: components are read through the world, such as world.getComponent(entity, Component)')
  if (usesWorldApi) config.conventions = { ecsApi: WORLD_API_CONVENTIONS }
  else if (![...project.text.values()].some((source) => source.includes(`${DEFAULT_CONFIG.conventions.queryFactory}(`))) config.conventions = { queryFactory: DETECTION.inlineQueryFactory }
  const frame = detectRegistration(project, toProject) ?? detectPipeline(project, ecs.game, toProject)
  config.pipeline = frame.pipeline
  report.push(frame.report)
  return { config, report }
}
