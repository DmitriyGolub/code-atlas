import { dirname, join, relative, sep } from 'node:path'
import ts from 'typescript'
import { compilerOptionsFor } from './tsconfig.mjs'
import { listSources } from '../files.mjs'

export function openProject(config) {
  const root = config.root
  const absolute = (path) => join(root, path)
  const inside = (file, directory) => file === absolute(directory) || file.startsWith(absolute(directory) + sep)
  const insideAny = (file, directories) => directories.some((directory) => inside(file, directory))
  const testPattern = new RegExp(config.testPattern)
  const list = (directory) => listSources(absolute(directory), config.skipFolders)
  const all = config.sources.flatMap(list)
  const source = all.filter((file) => !testPattern.test(file))
  const testFiles = [...new Set([...config.tests.flatMap(list), ...all.filter((file) => testPattern.test(file))])]
  const optionsFor = compilerOptionsFor(root, config.tsconfig)
  const options = { ...optionsFor(join(root, 'index.ts')), types: [], noEmit: true, allowJs: false }
  const host = ts.createCompilerHost(options)
  host.resolveModuleNameLiterals = (literals, containingFile) => literals.map((literal) => ts.resolveModuleName(literal.text, containingFile, optionsFor(containingFile), host))
  const program = ts.createProgram({ rootNames: [...source, ...testFiles], options, host })
  const checker = program.getTypeChecker()
  const sourceSet = new Set(source)
  const relativePath = (fileName) => relative(root, fileName).split(sep).join('/')
  const lineOf = (node) => node.getSourceFile().getLineAndCharacterOfPosition(node.getStart()).line + 1
  const declarationOf = (symbol) => symbol?.valueDeclaration ?? symbol?.declarations?.[0]
  const isComponentName = (name) => /^[A-Z]/.test(name) && !/^[A-Z0-9_]+$/.test(name)
  return {
    config, root, absolute, inside, insideAny, source, testFiles, program, checker, relativePath, lineOf, declarationOf,
    sourceFilesOfProject: () => program.getSourceFiles().filter((item) => sourceSet.has(item.fileName)),
    location: (node) => ({ file: relativePath(node.getSourceFile().fileName), line: lineOf(node) }),
    resolveSymbol(node) {
      let symbol = checker.getSymbolAtLocation(node)
      if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol)
      return symbol
    },
    isComponentDeclaration: (declaration) => declaration && inside(declaration.getSourceFile().fileName, config.layers.components) && ts.isVariableDeclaration(declaration) && isComponentName(declaration.name.getText()),
    directoryOf: (file) => dirname(file),
  }
}
