import ts from 'typescript'
import { complexityOf, docOf, linesOf } from './describe.mjs'

const isExported = (statement) => !!statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
const decoratorsOf = (node) => (ts.canHaveDecorators(node) ? ts.getDecorators(node) ?? [] : []).map((decorator) => (ts.isCallExpression(decorator.expression) ? decorator.expression.expression : decorator.expression).getText())
const isCallable = (member) => ts.isMethodDeclaration(member) || ts.isGetAccessorDeclaration(member) || (ts.isPropertyDeclaration(member) && !!member.initializer && (ts.isArrowFunction(member.initializer) || ts.isFunctionExpression(member.initializer)))

const EXTRACTORS = [
  { matches: (statement) => ts.isFunctionDeclaration(statement) && !!statement.name, extract: (statement) => [{ node: statement, name: statement.name.getText(), docNode: statement }] },
  { matches: ts.isVariableStatement, extract: (statement) => statement.declarationList.declarations.filter((item) => ts.isIdentifier(item.name)).map((node) => ({ node, name: node.name.getText(), docNode: statement })) },
  {
    matches: (statement) => ts.isClassDeclaration(statement) && !!statement.name,
    extract: (statement) => {
      const owner = statement.name.getText()
      const members = statement.members.filter((member) => isCallable(member) && member.name && !ts.isPrivateIdentifier(member.name))
      return [
        { node: statement, name: owner, docNode: statement, decorators: decoratorsOf(statement) },
        ...members.map((member) => ({ node: member, name: `${owner}.${member.name.getText()}`, docNode: member, decorators: decoratorsOf(member), member: true, owner })),
      ]
    },
  },
]

function declarationsOf(statement) {
  const extractor = EXTRACTORS.find((candidate) => candidate.matches(statement))
  return (extractor?.extract(statement) ?? []).map((entry) => ({ decorators: [], member: false, ...entry, exported: isExported(statement) }))
}

export const FACT_KEYS = ['reads', 'writes', 'adds', 'removes', 'eventReads', 'eventWrites', 'ports']

export function collectUnits(project) {
  const { config, inside, insideAny, relativePath, location } = project
  const { conventions, layers } = config
  const kindOf = (name, file) => {
    if (inside(file, layers.systems) && name.endsWith(conventions.systemSuffix)) return 'system'
    if (inside(file, layers.components)) return 'component'
    if (name.endsWith(conventions.querySuffix)) return 'query'
    if (insideAny(file, layers.config)) return 'config'
    if (insideAny(file, layers.entities)) return 'entity'
    if (inside(file, layers.game)) return 'rule'
    return 'outside'
  }
  const units = new Map()
  const unitByDeclaration = new Map()
  const add = (file, entry) => {
    const id = `${relativePath(file.fileName)}#${entry.name}`
    const unit = {
      id, name: entry.name, kind: entry.member ? 'method' : kindOf(entry.name, file.fileName), ...location(entry.node),
      exported: entry.exported, lines: linesOf(entry.node), complexity: complexityOf(entry.node), doc: docOf(entry.docNode),
      ...(entry.decorators.length ? { decorators: entry.decorators } : {}), ...(entry.member ? { owner: `${relativePath(file.fileName)}#${entry.owner}` } : {}),
      calls: [], references: [], queries: [], queryTerms: null, planned: false, declaration: entry.node,
      ...Object.fromEntries(FACT_KEYS.map((key) => [key, []])),
    }
    units.set(id, unit)
    unitByDeclaration.set(entry.node, unit)
  }
  for (const file of project.sourceFilesOfProject()) for (const statement of file.statements) for (const entry of declarationsOf(statement)) add(file, entry)
  return {
    units,
    unitOfSymbol: (symbol) => unitByDeclaration.get(project.declarationOf(symbol)) ?? null,
    enclosingUnit(node) {
      for (let current = node; current; current = current.parent) if (unitByDeclaration.has(current)) return unitByDeclaration.get(current)
      return null
    },
  }
}
