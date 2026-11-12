import { join } from 'node:path'
import ts from 'typescript'
import { registeredSystems } from './analyze/worldApi.mjs'

export function readPipeline({ program, config, unitOfSymbol, resolveSymbol }) {
  const empty = { simulation: [], view: [], modes: new Map() }
  if (!config.pipeline.file) return empty
  const file = program.getSourceFile(join(config.root, config.pipeline.file))
  if (!file) return empty
  if (config.pipeline.register) {
    const nameOf = (node) => unitOfSymbol(resolveSymbol(node))?.name ?? node.getText()
    const systems = registeredSystems(program, file, config.pipeline.register, nameOf)
    return { simulation: systems, view: [], modes: new Map(systems.map((name) => [name, 'all'])) }
  }

  const constants = new Map()
  for (const statement of file.statements) {
    if (!ts.isVariableStatement(statement)) continue
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.initializer) constants.set(declaration.name.text, declaration.initializer)
    }
  }

  function systemName(node) {
    const unit = unitOfSymbol(resolveSymbol(node))
    return unit?.kind === 'system' ? unit.name : null
  }

  function expand(node, bindings = new Map(), depth = 0) {
    if (!node || depth > 20) return []
    if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression?.(node)) return expand(node.expression, bindings, depth + 1)
    if (ts.isArrayLiteralExpression(node)) return node.elements.flatMap((element) => expand(ts.isSpreadElement(element) ? element.expression : element, bindings, depth + 1))
    if (ts.isIdentifier(node)) {
      if (bindings.has(node.text)) return expand(bindings.get(node.text), new Map(), depth + 1)
      const system = systemName(node)
      if (system) return [system]
      if (constants.has(node.text)) return expand(constants.get(node.text), bindings, depth + 1)
      return []
    }
    if (ts.isCallExpression(node)) {
      const callee = ts.isIdentifier(node.expression) ? constants.get(node.expression.text) : null
      if (callee && (ts.isArrowFunction(callee) || ts.isFunctionExpression(callee))) {
        const inner = new Map(bindings)
        callee.parameters.forEach((parameter, index) => { if (ts.isIdentifier(parameter.name) && node.arguments[index]) inner.set(parameter.name.text, node.arguments[index]) })
        return expand(callee.body, inner, depth + 1)
      }
      return node.arguments.flatMap((argument) => expand(argument, bindings, depth + 1))
    }
    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) return expand(node.body, bindings, depth + 1)
    if (ts.isBlock(node)) {
      const returned = node.statements.find(ts.isReturnStatement)
      return returned ? expand(returned.expression, bindings, depth + 1) : []
    }
    return []
  }

  const unique = (list) => [...new Set(list)]
  const entries = config.pipeline.entries.filter((name) => constants.has(name)).map((name) => ({ name, systems: unique(expand(constants.get(name))) }))
  const merged = []
  for (const entry of entries) {
    entry.systems.forEach((system, index) => {
      if (merged.includes(system)) return
      const previous = entry.systems.slice(0, index).reverse().find((name) => merged.includes(name))
      merged.splice(previous ? merged.indexOf(previous) + 1 : 0, 0, system)
    })
  }
  const view = config.pipeline.view && constants.has(config.pipeline.view) ? unique(expand(constants.get(config.pipeline.view))) : []
  const modes = new Map()
  for (const system of merged) {
    const owners = entries.filter((entry) => entry.systems.includes(system)).map((entry) => entry.name)
    modes.set(system, owners.length === entries.length ? 'all' : owners.map((name) => config.pipeline.modes[name] ?? name).join(', '))
  }
  return { simulation: merged.filter((name) => !view.includes(name)), view, modes }
}
