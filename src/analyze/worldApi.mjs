import ts from 'typescript'

const ROLES = ['read', 'has', 'add', 'remove', 'query']

function queryName(call) {
  const target = ts.isBinaryExpression(call.parent) ? call.parent.left : ts.isVariableDeclaration(call.parent) || ts.isPropertyDeclaration(call.parent) ? call.parent.name : null
  return target ? target.getText().replace(/^this\./, '') : 'query'
}

const methodName = (node) => (ts.isPropertyAccessExpression(node.expression) ? node.expression.name.getText() : null)

function fieldsOf(call) {
  let current = call
  while (ts.isParenthesizedExpression(current.parent) || ts.isNonNullExpression(current.parent) || ts.isAsExpression(current.parent)) current = current.parent
  const parent = current.parent
  if (ts.isVariableDeclaration(parent) && ts.isObjectBindingPattern(parent.name)) return parent.name.elements.map((element) => (element.propertyName ?? element.name).getText())
  if (ts.isPropertyAccessExpression(parent) && parent.expression === current) return [parent.name.getText()]
  return ['*']
}

export function collectWorldApiFacts(project, { enclosingUnit, unitOfSymbol }) {
  const api = project.config.conventions.ecsApi
  const components = new Set()
  if (!api) return components
  const roleOf = new Map(ROLES.flatMap((role) => (api[role] ?? []).map((name) => [name, role])))
  const negations = new Set(api.not ?? [])
  const record = (unit, list, value, node, extra = {}) => unit[list].push({ value, ...project.location(node), ...extra })
  const nameOf = (node) => {
    const target = ts.isNewExpression(node) ? node.expression : node
    if (!ts.isIdentifier(target) && !ts.isPropertyAccessExpression(target)) return null
    const unit = unitOfSymbol(project.resolveSymbol(ts.isPropertyAccessExpression(target) ? target.name : target))
    return unit?.name ?? (ts.isPropertyAccessExpression(target) ? target.name.getText() : target.getText())
  }
  const component = (node) => {
    const name = node && nameOf(node)
    if (name) components.add(name)
    return name
  }
  const handlers = {
    read: (unit, call) => { const name = component(call.arguments[api.componentArgument]); if (name) for (const field of fieldsOf(call)) record(unit, 'reads', `${name}.${field}`, call) },
    has: (unit, call) => { const name = component(call.arguments[api.componentArgument]); if (name) record(unit, 'reads', `${name}.query`, call) },
    add: (unit, call) => { const name = component(call.arguments[api.componentArgument]); if (name) record(unit, 'adds', name, call) },
    remove: (unit, call) => { const name = component(call.arguments[api.componentArgument]); if (name) record(unit, 'removes', name, call) },
    query: (unit, call) => {
      const terms = call.arguments.find(ts.isArrayLiteralExpression)?.elements ?? []
      unit.apiQueries = [...(unit.apiQueries ?? []), { name: queryName(call), terms: terms.map((term) => term.getText()), ...project.location(call) }]
      for (const term of terms) {
        const negated = ts.isCallExpression(term) && ts.isIdentifier(term.expression) && negations.has(term.expression.text)
        const name = component(negated ? term.arguments[0] : term)
        if (name) record(unit, 'reads', `${name}.query`, call, negated ? { excluded: true } : {})
      }
    },
  }
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const role = roleOf.get(methodName(node))
      const unit = role && enclosingUnit(node)
      if (unit) handlers[role](unit, node)
    }
    ts.forEachChild(node, visit)
  }
  for (const file of project.sourceFilesOfProject()) visit(file)
  return components
}

export function registeredSystems(program, file, method, resolveName) {
  const names = []
  const visit = (node) => {
    if (ts.isCallExpression(node) && methodName(node) === method) {
      const created = node.arguments[0]
      if (created && ts.isNewExpression(created)) names.push(resolveName(created.expression))
    }
    ts.forEachChild(node, visit)
  }
  if (file) visit(file)
  return [...new Set(names.filter(Boolean))]
}
