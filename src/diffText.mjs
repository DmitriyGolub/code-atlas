const at = (item) => (item.file ? ` (${item.file}:${item.line})` : '')
const via = (edge) => edge.via.replace('component:', '').replace('event:', 'events.')
const factLines = (items, sign) => items.map((item) => `    ${sign} ${item.label} ${item.value}${at(item)}`)

export function diffText(result, ref) {
  const { systems, plan, edges, findings } = result
  const lines = [`# Code atlas diff against ${ref}`, '']
  const empty = !systems.added.length && !systems.removed.length && !systems.changed.length && !plan.length && !edges.added.length && !edges.removed.length && !findings.added.length && !findings.removed.length
  if (empty) return [...lines, 'No changes in systems, data links or findings.'].join('\n')
  if (systems.added.length) {
    lines.push(`NEW SYSTEMS ${systems.added.length}`)
    for (const system of systems.added) {
      lines.push(`  #${system.position} ${system.name}${system.planned ? ' (stub, from // criteria)' : ''}${at(system)}`)
      lines.push(...factLines(system.facts, '+'))
    }
    lines.push('')
  }
  if (plan.length) {
    lines.push(`PLAN VS CODE ${plan.length} (stubs at ${ref} that are code now)`)
    for (const system of plan) {
      lines.push(`  ${system.name}${at(system)}${!system.gained.length && !system.lost.length ? ' matches the plan' : ''}`)
      lines.push(...system.lost.map((item) => `    - in plan, not in code: ${item.label} ${item.value}`))
      lines.push(...system.gained.map((item) => `    + in code, not in plan: ${item.label} ${item.value}${at(item)}`))
    }
    lines.push('')
  }
  if (systems.changed.length) {
    lines.push(`CHANGED SYSTEMS ${systems.changed.length}`)
    for (const system of systems.changed) {
      lines.push(`  ${system.name}${system.movedFrom !== undefined ? ` moved #${system.movedFrom} -> #${system.position}` : ''}${at(system)}`)
      lines.push(...factLines(system.gained, '+'), ...factLines(system.lost, '-'))
    }
    lines.push('')
  }
  if (systems.removed.length) lines.push(`REMOVED SYSTEMS ${systems.removed.length}`, ...systems.removed.map((system) => `  ${system.name}`), '')
  if (edges.added.length || edges.removed.length) {
    lines.push(`DATA LINKS +${edges.added.length} -${edges.removed.length} (hub components left out)`)
    lines.push(...edges.added.map((edge) => `  + ${edge.from} -> ${edge.to} via ${via(edge)}${edge.nextFrame ? ' (next frame)' : ''}`))
    lines.push(...edges.removed.map((edge) => `  - ${edge.from} -> ${edge.to} via ${via(edge)}`))
    lines.push('')
  }
  if (findings.added.length || findings.removed.length) {
    lines.push(`FINDINGS +${findings.added.length} -${findings.removed.length}`)
    lines.push(...findings.added.map((finding) => `  + ${finding.kind} ${finding.system}: ${finding.text}${at(finding)}${finding.accepted ? ' [accepted]' : ''}`))
    lines.push(...findings.removed.map((finding) => `  - ${finding.kind} ${finding.system}: ${finding.text}`))
  }
  return lines.join('\n').trimEnd()
}
