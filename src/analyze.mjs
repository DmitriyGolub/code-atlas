import { readPipeline } from './pipeline.mjs'
import { openProject } from './analyze/project.mjs'
import { collectUnits } from './analyze/units.mjs'
import { collectFacts } from './analyze/facts.mjs'
import { collectWorldApiFacts } from './analyze/worldApi.mjs'
import { readCriteria } from './analyze/criteria.mjs'
import { buildFrame, componentOf } from './analyze/frame.mjs'
import { findIssues } from './analyze/findings.mjs'
import { callersOf, collectTests, sourceDigest } from './analyze/tests.mjs'

export function analyze(config) {
  const project = openProject(config)
  const { units, unitOfSymbol, enclosingUnit } = collectUnits(project)
  collectFacts(project, { enclosingUnit, unitOfSymbol })
  const apiComponents = collectWorldApiFacts(project, { enclosingUnit, unitOfSymbol })
  const componentNames = new Set([...[...units.values()].filter((unit) => unit.kind === 'component').map((unit) => unit.name), ...apiComponents])
  readCriteria(config, units, componentNames)
  const order = readPipeline({ program: project.program, checker: project.checker, config, units, unitOfSymbol, resolveSymbol: project.resolveSymbol })
  const { frame, closure, systems, systemByName, edges } = buildFrame(config, units, componentNames, order)
  return {
    config, units, systems, systemByName, edges, frame, order, componentNames, closure, componentOf,
    findings: findIssues(project, units, { systems, systemByName, edges }),
    tests: collectTests(project, unitOfSymbol),
    callersOf: callersOf(units),
    sourceDigest: sourceDigest(project),
    isOutside: (file) => project.insideAny(project.absolute(file), config.layers.outside),
    pipelineFile: config.pipeline.file,
  }
}
