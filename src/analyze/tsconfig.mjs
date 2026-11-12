import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import ts from 'typescript'

const FALLBACK = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, jsx: ts.JsxEmit.Preserve }

function parse(file) {
  const read = ts.readConfigFile(file, ts.sys.readFile)
  return { ...FALLBACK, ...ts.parseJsonConfigFileContent(read.config ?? {}, ts.sys, dirname(file)).options }
}

export function compilerOptionsFor(root, rootConfig) {
  const named = join(root, rootConfig)
  const base = existsSync(named) ? parse(named) : existsSync(join(root, 'tsconfig.base.json')) ? parse(join(root, 'tsconfig.base.json')) : FALLBACK
  const byDirectory = new Map()
  const nearest = (directory) => {
    if (byDirectory.has(directory)) return byDirectory.get(directory)
    const file = join(directory, 'tsconfig.json')
    const options = existsSync(file) ? parse(file) : directory === root || dirname(directory) === directory ? base : nearest(dirname(directory))
    byDirectory.set(directory, options)
    return options
  }
  return (file) => (file.startsWith(root) ? nearest(dirname(file)) : base)
}
