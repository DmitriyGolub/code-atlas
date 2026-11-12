import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const SOURCE_FILE = /\.tsx?$/
const PNPM_PACKAGES = /^packages:\s*$/m
const YAML_LIST_ITEM = /^\s*-\s*['"]?([^'"\n]+)['"]?/gm
const GLOB_TAIL = /\/\*+$/
const DECLARATION_FILE = /\.d\.ts$/

const entryKind = (path) => {
  try {
    const stats = lstatSync(path)
    return stats.isSymbolicLink() ? 'link' : stats.isDirectory() ? 'directory' : 'file'
  } catch {
    return 'missing'
  }
}

export const isDirectory = (path) => entryKind(path) === 'directory'

export function listSources(directory, skipFolders, onDirectory = () => {}) {
  if (!existsSync(directory)) return []
  const skipped = new Set(skipFolders)
  const visit = (current) => readdirSync(current).flatMap((name) => {
    const path = join(current, name)
    const kind = entryKind(path)
    if (kind === 'directory') {
      if (skipped.has(name) || name.startsWith('.')) return []
      onDirectory(path)
      return visit(path)
    }
    return kind === 'file' && SOURCE_FILE.test(name) && !DECLARATION_FILE.test(name) ? [path] : []
  })
  return visit(directory)
}

export function workspaceFolders(root) {
  const globs = []
  const pnpm = join(root, 'pnpm-workspace.yaml')
  if (existsSync(pnpm)) {
    const block = readFileSync(pnpm, 'utf8').split(PNPM_PACKAGES)[1]?.split(/^\S/m)[0] ?? ''
    globs.push(...[...block.matchAll(YAML_LIST_ITEM)].map((match) => match[1].trim()))
  }
  const manifest = join(root, 'package.json')
  const workspaces = existsSync(manifest) ? JSON.parse(readFileSync(manifest, 'utf8')).workspaces : undefined
  globs.push(...(Array.isArray(workspaces) ? workspaces : workspaces?.packages ?? []))
  return [...new Set(globs.map((glob) => glob.replace(GLOB_TAIL, '')).filter((folder) => existsSync(join(root, folder))))]
}

export const childFolders = (directory) => (existsSync(directory) ? readdirSync(directory).map((name) => join(directory, name)).filter(isDirectory) : [])
