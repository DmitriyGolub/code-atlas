import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const MODIFIERS = new Set(['only', 'skip', 'todo', 'concurrent', 'sequential', 'fails', 'each'])

function titleOf(node, runners) {
  if (!ts.isCallExpression(node) || !node.arguments[0] || !ts.isStringLiteralLike(node.arguments[0])) return null
  const callee = ts.isCallExpression(node.expression) ? node.expression.expression : node.expression
  const [runner, ...modifiers] = callee.getText().split('.')
  return runners.has(runner) && modifiers.every((modifier) => MODIFIERS.has(modifier)) ? node.arguments[0].text : null
}

export function collectTests(project, unitOfSymbol) {
  const { config, program, testFiles, relativePath, lineOf, resolveSymbol, declarationOf, insideAny } = project
  const runners = new Set(config.testRunners)
  const tests = []
  for (const file of testFiles.map((name) => program.getSourceFile(name)).filter(Boolean)) {
    const visitTest = (node) => {
      const title = titleOf(node, runners)
      if (title !== null) {
        const test = { title, file: relativePath(file.fileName), line: lineOf(node), symbols: new Set(), simulates: false }
        const helpers = new Set()
        const walk = (child) => {
          if (ts.isIdentifier(child)) {
            const symbol = resolveSymbol(child)
            const target = unitOfSymbol(symbol)
            if (target) test.symbols.add(target.id)
            const helper = declarationOf(symbol)
            if (helper && !helpers.has(helper) && insideAny(helper.getSourceFile().fileName, config.testHelpers)) {
              helpers.add(helper)
              walk(helper)
            }
            if (config.simulationHelpers.includes(child.getText())) test.simulates = true
          }
          ts.forEachChild(child, walk)
        }
        if (node.arguments[1]) walk(node.arguments[1])
        tests.push({ ...test, symbols: [...test.symbols].sort() })
        return
      }
      ts.forEachChild(node, visitTest)
    }
    visitTest(file)
  }
  return tests
}

export function callersOf(units) {
  const callers = new Map()
  for (const unit of units.values()) {
    for (const link of [...unit.calls, ...unit.references, ...unit.queries]) callers.set(link.value, [...(callers.get(link.value) ?? []), { unit: unit.id, file: link.file, line: link.line }])
  }
  return callers
}

export function sourceDigest(project) {
  const digest = createHash('sha1')
  for (const file of [...project.source, ...project.testFiles].sort()) digest.update(project.relativePath(file)).update(readFileSync(file))
  return digest.digest('hex').slice(0, 16)
}
