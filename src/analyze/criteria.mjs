export function readCriteria(config, units, componentNames) {
  const addWords = new RegExp(`(${config.criteria.add.join('|')})`, 'i')
  const removeWords = new RegExp(`(${config.criteria.remove.join('|')})`, 'i')
  for (const unit of units.values()) {
    if (unit.kind !== 'system' && unit.kind !== 'rule') continue
    const text = unit.declaration.getText()
    const comments = [...text.matchAll(/^\s*\/\/(.*)$/gm)]
    const body = text.replace(/^\s*\/\/.*$/gm, '')
    const inner = body.slice(body.indexOf('{') + 1, body.lastIndexOf('}')).replace(/\s+/g, ' ').trim()
    if (!comments.length || inner) continue
    unit.planned = true
    const file = unit.declaration.getSourceFile()
    for (const comment of comments) {
      const line = file.getLineAndCharacterOfPosition(unit.declaration.getStart() + comment.index).line + 1
      for (const match of comment[1].matchAll(/\b([A-Z][A-Za-z0-9]+)(?:\.(\w+))?/g)) {
        if (!componentNames.has(match[1])) continue
        const before = comment[1].slice(Math.max(0, match.index - 24), match.index)
        const after = comment[1].slice(match.index + match[0].length)
        if (removeWords.test(before)) unit.removes.push({ value: match[1], file: unit.file, line })
        else if (addWords.test(before)) unit.adds.push({ value: match[1], file: unit.file, line })
        else if (match[2] && /^\s*[-+*]?=(?!=)/.test(after)) unit.writes.push({ value: `${match[1]}.${match[2]}`, file: unit.file, line })
        else unit.reads.push({ value: `${match[1]}.${match[2] ?? '*'}`, file: unit.file, line })
      }
    }
  }
}
