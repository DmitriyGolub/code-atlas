import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

export const CONFIG_FILE = 'code-atlas.config.json'

export const WORLD_API_CONVENTIONS = {
  read: ['getComponent'],
  has: ['hasComponent'],
  add: ['addComponent', 'addTag'],
  remove: ['removeComponent', 'removeTag'],
  query: ['createQuery', 'queryEntities'],
  not: ['NOT', 'Not'],
  componentArgument: 1,
}

export const DEFAULT_CONFIG = {
  tsconfig: 'tsconfig.json',
  sources: ['src'],
  tests: ['tests'],
  testHelpers: ['tests/support'],
  simulationHelpers: ['simulate', 'runSystems'],
  testPattern: '\\.(test|spec|e2e)\\.tsx?$',
  testRunners: ['it', 'test'],
  testFolders: ['tests', 'test', '__tests__', 'spec', 'qa', '.qa', 'e2e'],
  skipFolders: ['node_modules', 'dist', 'build', 'coverage', '.git', '.next', '.turbo', 'out'],
  out: 'docs/code-atlas',
  split: false,
  layers: {
    components: 'src/game/ecs/components',
    systems: 'src/game/ecs/systems',
    entities: ['src/game/entities'],
    config: ['src/game/config'],
    game: 'src/game',
    outside: ['src/app', 'src/ui', 'src/platform'],
  },
  conventions: {
    systemSuffix: 'System',
    querySuffix: 'Query',
    queryFactory: 'defineQuery',
    excludeTerm: 'Not',
    addTag: ['addComponent'],
    removeTag: ['removeComponent'],
    addTags: ['addComponents'],
    events: 'events',
    ports: { object: 'world', names: ['render', 'hud', 'input'] },
    ecsApi: null,
  },
  pipeline: {
    file: 'src/game/ecs/systems/index.ts',
    entries: ['pipeline'],
    view: null,
    register: null,
    modes: {},
  },
  criteria: {
    add: ['add', 'set tag', 'tag with'],
    remove: ['remove', 'clear tag', 'untag'],
  },
  findings: {
    hubReaders: 10,
    wideSystem: 6,
    ignoreWriteOnlyIn: [],
    accepted: [],
  },
}

function merge(base, override) {
  if (Array.isArray(base) || typeof base !== 'object' || base === null) return override ?? base
  const result = { ...base }
  for (const [key, value] of Object.entries(override ?? {})) {
    result[key] = key in base && typeof base[key] === 'object' && base[key] !== null && !Array.isArray(base[key]) ? merge(base[key], value) : value
  }
  return result
}

export function loadConfig(root, configFile = CONFIG_FILE) {
  const absoluteRoot = resolve(root)
  const file = resolve(absoluteRoot, configFile)
  const own = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}
  delete own.$schema
  return { ...merge(DEFAULT_CONFIG, own), root: absoluteRoot }
}
