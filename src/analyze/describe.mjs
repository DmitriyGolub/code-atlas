import ts from 'typescript'

const BRANCHES = new Set([
  ts.SyntaxKind.IfStatement, ts.SyntaxKind.ConditionalExpression, ts.SyntaxKind.CaseClause, ts.SyntaxKind.ForStatement, ts.SyntaxKind.ForOfStatement,
  ts.SyntaxKind.ForInStatement, ts.SyntaxKind.WhileStatement, ts.SyntaxKind.DoStatement, ts.SyntaxKind.CatchClause,
])
const LOGICAL = new Set([ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken])
const DOC_LENGTH = 400

export function complexityOf(node) {
  let count = 1
  const visit = (child) => {
    if (BRANCHES.has(child.kind) || (ts.isBinaryExpression(child) && LOGICAL.has(child.operatorToken.kind))) count++
    ts.forEachChild(child, visit)
  }
  ts.forEachChild(node, visit)
  return count
}

export function docOf(statement) {
  const text = statement.getSourceFile().getFullText()
  const ranges = ts.getLeadingCommentRanges(text, statement.getFullStart()) ?? []
  const block = ranges.filter((range) => text.slice(range.pos, range.end).startsWith('/**')).at(-1)
  if (!block) return ''
  const body = text.slice(block.pos + 3, block.end - 2).split('\n').map((line) => line.replace(/^\s*\*\s?/, '').trimEnd())
  const prose = body.filter((line) => !line.startsWith('@')).join('\n').trim().replace(/([^\n])\n(?!\n)/g, '$1 ')
  return prose.length > DOC_LENGTH ? `${prose.slice(0, DOC_LENGTH - 1)}…` : prose
}

export function linesOf(node) {
  const file = node.getSourceFile()
  return file.getLineAndCharacterOfPosition(node.getEnd()).line - file.getLineAndCharacterOfPosition(node.getStart()).line + 1
}
