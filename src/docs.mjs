const DOCUMENTED_KINDS = new Set(['system', 'rule', 'entity', 'component', 'outside'])

export function docsText(model, limit = 30) {
  const candidates = [...model.units.values()].filter((unit) => DOCUMENTED_KINDS.has(unit.kind) && (unit.exported || unit.kind === 'system'))
  const missing = candidates.filter((unit) => !unit.doc)
    .map((unit) => ({ unit, callers: (model.callersOf.get(unit.id) ?? []).length }))
    .sort((first, second) => second.callers - first.callers || first.unit.id.localeCompare(second.unit.id))
  const width = Math.max(0, ...missing.slice(0, limit).map(({ unit }) => `${unit.file}:${unit.line}`.length))
  return [
    `# Symbols without a doc comment, most used first`,
    `${candidates.length - missing.length} of ${candidates.length} exported symbols have a /** */ comment.`,
    '',
    ...missing.slice(0, limit).map(({ unit, callers }) => `  ${`${unit.file}:${unit.line}`.padEnd(width)}  ${unit.name}  (${unit.kind}, ${callers} callers)`),
    ...(missing.length > limit ? [`  … ${missing.length - limit} more, use --limit`] : []),
    '',
    'Write one or two sentences above each: what it is for and what it guarantees. Leave the how to the code and the behaviour to the tests.',
  ].join('\n')
}
