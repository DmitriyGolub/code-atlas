import ts from 'typescript'

export function collectFacts(project, { enclosingUnit, unitOfSymbol }) {
  const { config, location, resolveSymbol, declarationOf, isComponentDeclaration } = project
  const { conventions } = config
  function componentName(node) {
    if (!ts.isIdentifier(node)) return null
    const declaration = declarationOf(resolveSymbol(node))
    return isComponentDeclaration(declaration) ? declaration.name.getText() : null
  }

  function componentsBehind(node) {
    const direct = componentName(node)
    if (direct) return [direct]
    if (!ts.isIdentifier(node)) return []
    const declaration = declarationOf(resolveSymbol(node))
    if (declaration && ts.isVariableDeclaration(declaration) && ts.isVariableDeclarationList(declaration.parent) && ts.isForOfStatement(declaration.parent.parent)) {
      const iterated = declaration.parent.parent.expression
      const listDeclaration = ts.isIdentifier(iterated) ? declarationOf(resolveSymbol(iterated)) : null
      const literal = listDeclaration?.initializer && ts.isArrayLiteralExpression(listDeclaration.initializer) ? listDeclaration.initializer : ts.isArrayLiteralExpression(iterated) ? iterated : null
      if (literal) return literal.elements.map(componentName).filter(Boolean)
    }
    return []
  }

  function accessMode(node) {
    let current = node
    while (ts.isParenthesizedExpression(current.parent)) current = current.parent
    const parent = current.parent
    if (ts.isBinaryExpression(parent) && parent.left === current && parent.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && parent.operatorToken.kind <= ts.SyntaxKind.LastAssignment) {
      return parent.operatorToken.kind === ts.SyntaxKind.EqualsToken ? 'write' : 'both'
    }
    if ((ts.isPrefixUnaryExpression(parent) || ts.isPostfixUnaryExpression(parent)) && [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(parent.operator)) return 'both'
    return 'read'
  }

  const tagFunctions = Object.fromEntries([...conventions.addTag.map((name) => [name, 'adds']), ...conventions.removeTag.map((name) => [name, 'removes'])])
  const record = (unit, list, value, node) => unit[list].push({ value, ...location(node) })
  const eventsPattern = new RegExp(`(^|\\.)${conventions.events}$`)
  const portObject = new RegExp(`(^|\\.)${conventions.ports.object}$`)

  function visit(node) {
    const unit = enclosingUnit(node)
    if (unit) {
      if (ts.isNewExpression(node)) {
        const target = unitOfSymbol(resolveSymbol(node.expression))
        if (target && target !== unit) record(unit, 'calls', target.id, node)
      } else if (ts.isCallExpression(node)) {
        const callee = ts.isPropertyAccessExpression(node.expression) ? node.expression.name : node.expression
        const calleeName = callee.getText()
        if (tagFunctions[calleeName] && node.arguments.length >= 3) {
          for (const component of componentsBehind(node.arguments[2])) record(unit, tagFunctions[calleeName], component, node)
        } else if (conventions.addTags.includes(calleeName)) {
          for (const argument of node.arguments.slice(2)) for (const component of componentsBehind(argument)) record(unit, 'adds', component, node)
        } else if (calleeName === conventions.queryFactory && node.arguments[0] && ts.isArrayLiteralExpression(node.arguments[0])) {
          unit.queryTerms = node.arguments[0].elements.map((element) => element.getText())
        }
        const target = unitOfSymbol(resolveSymbol(callee))
        if (target && target !== unit) record(unit, target.kind === 'query' ? 'queries' : 'calls', target.id, node)
      } else if (ts.isIdentifier(node) && !ts.isImportSpecifier(node.parent) && !ts.isExportSpecifier(node.parent) && node.parent.name !== node
        && !(ts.isCallExpression(node.parent) && node.parent.expression === node) && !(ts.isPropertyAccessExpression(node.parent) && node.parent.name === node)) {
        const target = unitOfSymbol(resolveSymbol(node))
        if (target && target !== unit && ['rule', 'entity', 'system', 'query'].includes(target.kind)) record(unit, target.kind === 'query' ? 'queries' : 'references', target.id, node)
      }
      if (ts.isElementAccessExpression(node)) {
        const base = node.expression
        let component = null
        let field = null
        if (ts.isPropertyAccessExpression(base) && componentName(base.expression)) {
          component = componentName(base.expression)
          field = base.name.getText()
        } else if (ts.isElementAccessExpression(base) && componentName(base.expression)) {
          component = componentName(base.expression)
          field = ts.isStringLiteral(base.argumentExpression) ? base.argumentExpression.text : '*'
        }
        if (component) {
          const mode = accessMode(node)
          if (mode !== 'write') record(unit, 'reads', `${component}.${field}`, node)
          if (mode !== 'read') record(unit, 'writes', `${component}.${field}`, node)
        }
      }
      if (ts.isPropertyAccessExpression(node) && eventsPattern.test(node.expression.getText()) && node.name.getText() !== 'push') {
        const event = node.name.getText()
        const pushes = ts.isPropertyAccessExpression(node.parent) && node.parent.name.getText() === 'push' && ts.isCallExpression(node.parent.parent)
        const mode = accessMode(node)
        if (pushes || mode !== 'read') record(unit, 'eventWrites', event, node)
        if (!pushes && mode !== 'write') record(unit, 'eventReads', event, node)
      }
      if (ts.isPropertyAccessExpression(node) && conventions.ports.names.includes(node.name.getText()) && portObject.test(node.expression.getText())) {
        const member = ts.isPropertyAccessExpression(node.parent) && node.parent.expression === node ? `.${node.parent.name.getText()}` : ''
        record(unit, 'ports', `${node.name.getText()}${member}`, node)
      }
    }
    ts.forEachChild(node, visit)
  }
  for (const file of project.sourceFilesOfProject()) visit(file)
}
