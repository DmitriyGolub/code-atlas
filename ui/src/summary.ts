import type { Unit } from './types'
import { shortName, type Model } from './model'
import { kindLabel } from './kinds'
import { coverageOf } from './coverage'

const LISTED = 3

const folderOf = (file: string) => file.split('/').slice(0, -1).filter((part) => part !== 'src').slice(-2).join('/') || '.'
const areaOf = (file: string) => file.split('/').filter((part) => part !== 'src').slice(0, 2).join('/')
const names = (list: string[]) => list.slice(0, LISTED).join(', ') + (list.length > LISTED ? ` and ${list.length - LISTED} more` : '')

export function summaryOf(model: Model, unit: Unit): string {
  const callers = [...new Set(unit.callers.map((caller) => caller.name))]
  const calls = [...new Set((unit.calls ?? []).map((call) => call.name))]
  const areas = new Set(unit.callers.map((caller) => areaOf(caller.file)))
  const { direct, indirect } = coverageOf(model, unit.id)
  const label = kindLabel(unit)
  const parts = [`${label[0].toUpperCase()}${label.slice(1)} in ${folderOf(unit.file)}.`]
  const system = model.systemByName.get(unit.name)
  if (system) {
    const components = (list: { value: string }[]) => [...new Set(list.map((item) => item.value.split('.')[0]))]
    if (system.position) parts.push(`Runs at step ${system.position} of ${model.spec.frame.length}.`)
    if (system.reads.length) parts.push(`Reads ${names(components(system.reads))}.`)
    if (system.writes.length) parts.push(`Writes ${names(components(system.writes))}.`)
    if (system.eventWrites.length) parts.push(`Emits ${names([...new Set(system.eventWrites.map((item) => `events.${item.value}`))])}.`)
  }
  parts.push(callers.length ? `Used by ${callers.length} ${callers.length === 1 ? 'symbol' : 'symbols'}${areas.size > 1 ? ` across ${areas.size} areas` : ''}: ${names(callers.map(shortName))}.` : 'Nothing in the project calls it.')
  if (calls.length) parts.push(`Calls ${names(calls.map(shortName))}.`)
  parts.push(direct.length ? `${direct.length} ${direct.length === 1 ? 'test calls' : 'tests call'} it directly.` : 'No test calls it directly.')
  if (indirect.length) parts.push(`${indirect.length} more ${indirect.length === 1 ? 'test reaches' : 'tests reach'} it through callers.`)
  return parts.join(' ')
}
