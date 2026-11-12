import type { Caller, Test, Unit } from './types'
import { frameStep, type Model } from './model'
import { html, type Markup } from './markup'
import { chip, FINDING_TITLES } from './cardParts'
import { details, ecsFacts } from './cardEcs'
import { icon, type IconName } from './icons'
import { summaryOf } from './summary'
import { kindLabel } from './kinds'
import { coverageOf } from './coverage'

export type CardTab = 'overview' | 'tests'

const SHOWN_CHIPS = 12
const LEVELS = [[5, 'low'], [10, 'medium'], [Infinity, 'high']] as const

let collapsed = new Set<string>()

const block = (key: string, title: string, body: Markup, count?: number, name: IconName = 'info') =>
  html`<section class="block${collapsed.has(key) ? ' collapsed' : ''}"><button type="button" class="block-head" data-block="${key}">${icon(name)}<h3>${title}</h3>${count === undefined ? '' : html`<span class="count">${count}</span>`}</button><div class="block-body">${body}</div></section>`

const distinct = (list: Caller[]) => [...new Map(list.map((entry) => [entry.unit, entry])).values()]

function linkGroup(model: Model, title: string, entries: Caller[], expanded: boolean, key: 'callers' | 'calls'): Markup {
  if (!entries.length) return html``
  const shown = expanded ? entries : entries.slice(0, SHOWN_CHIPS)
  const more = entries.length - shown.length
  return block(key, title, html`<div class="chips">${shown.map((entry) => chip(model, entry.name, '', null, model.units.has(entry.unit) ? entry.unit : undefined))}${more > 0 ? html`<button type="button" class="chip more" data-expand="${key}">+ ${more} more</button>` : ''}</div>`, entries.length, key)
}

function members(model: Model, unit: Unit, expanded: Set<string>): Markup {
  const list = model.membersOf(unit.id)
  if (!list.length) return html``
  const shown = expanded.has('methods') ? list : list.slice(0, SHOWN_CHIPS)
  const more = list.length - shown.length
  return block('methods', 'Methods', html`<div class="chips">${shown.map((member) => chip(model, member.name.split('.').pop()!, kindLabel(member) === 'endpoint' ? 'event' : '', null, member.id))}${more > 0 ? html`<button type="button" class="chip more" data-expand="methods">+ ${more} more</button>` : ''}</div>`, list.length, 'code')
}

function detailsTable(model: Model, unit: Unit, callers: number, calls: number): Markup {
  const complexity = unit.complexity ?? 1
  const level = LEVELS.find(([limit]) => complexity <= limit)![1]
  const system = model.systemByName.get(unit.name)
  const row = (label: string, value: Markup | string) => html`<tr><th>${label}</th><td>${value}</td></tr>`
  return block('details', 'Details', html`<table class="details">
${unit.owner && model.units.has(unit.owner) ? row('Class', chip(model, model.units.get(unit.owner)!.name, '', null, unit.owner)) : ''}${(unit.decorators ?? []).length ? row('Decorators', (unit.decorators ?? []).map((name) => `@${name}`).join(' ')) : ''}${row('Called by', `${callers} symbols`)}${row('Calls', `${calls} symbols`)}${row('File', model.source(unit))}${row('Kind', kindLabel(unit))}
${system ? row('Frame', `${frameStep(model, system)} · ${system.phase}`) : ''}${row('Exported', unit.exported ? 'yes' : 'no')}${row('Lines', String(unit.lines ?? '–'))}
${row('Complexity', html`<span class="meter ${level}"><i style="width:${Math.min(100, complexity * 6)}%"></i></span>${level} (${complexity})`)}
</table>`)
}

const SHOWN_INDIRECT = 20
const coverageCount = (model: Model, id: string) => { const { direct, indirect } = coverageOf(model, id); return direct.length + indirect.length }

function testsOf(model: Model, id: string): Markup {
  const { direct, indirect } = coverageOf(model, id)
  const simulated = model.spec.impacts[id]?.simulationTests ?? 0
  const line = (title: string, at: Test, note = '') => html`<div class="line"><span title="${title}">${title}${note ? html` <small>${note}</small>` : ''}</span>${model.source(at)}</div>`
  return html`${block('tests', 'Tests that call it', html`${direct.length ? direct.map((test) => line(test.title, test)) : html`<p class="none">No test calls it directly.</p>`}`, direct.length, 'flask')}
${indirect.length ? block('indirect', 'Tests that reach it through callers', html`${indirect.slice(0, SHOWN_INDIRECT).map((entry) => line(entry.test.title, entry.test, `via ${entry.through}`))}${indirect.length > SHOWN_INDIRECT ? html`<p class="hint">and ${indirect.length - SHOWN_INDIRECT} more</p>` : ''}`, indirect.length, 'flask') : ''}
${simulated ? html`<p class="hint">${simulated} more tests run the whole frame and reach it indirectly.</p>` : ''}`
}

export function renderCard(model: Model, id: string, tab: CardTab, expanded: Set<string>, folded: Set<string>): Markup {
  collapsed = folded
  const unit = model.units.get(id)!
  const callers = distinct(unit.callers)
  const calls = distinct(unit.calls ?? [])
  const findings = model.spec.findings.filter((finding) => finding.system === unit.name)
  const header = html`<div class="identity"><div class="name" title="${unit.name}">${unit.name}</div><div class="row"><span class="badge ${unit.kind}">${kindLabel(unit)}</span>${unit.planned ? html`<span class="badge stub">stub</span>` : ''}${model.source(unit)}</div>
${unit.doc ? html`<p class="doc">${unit.doc}</p>` : html`<p class="doc generated" title="Built from the code. Add a /** */ comment above the declaration to replace it, code-atlas docs lists the symbols that need one most.">${summaryOf(model, unit)}</p>`}</div>`
  const tabs = html`<div class="tabs small card-tabs">${(['overview', 'tests'] as const).map((name) => html`<button type="button" data-card-tab="${name}" class="${tab === name ? 'active' : ''}">${icon(name === 'overview' ? 'info' : 'flask')}${name === 'overview' ? 'Overview' : html`Tests <span class="count">${coverageCount(model, id)}</span>`}</button>`)}</div>`
  if (tab === 'tests') return html`<div class="card-body">${header}${tabs}${testsOf(model, id)}</div>`
  const system = unit.kind === 'system' ? model.systemByName.get(unit.name) : undefined
  const ecs = model.mode === 'frame' ? ecsFacts(model, id) : []
  return html`<div class="card-body">${header}${tabs}
${ecs.length ? block('data', 'Data', html`<div class="facts">${ecs}</div>`, undefined, 'flow') : ''}
${members(model, unit, expanded)}${linkGroup(model, 'Callers', callers, expanded.has('callers'), 'callers')}${linkGroup(model, 'Calls', calls, expanded.has('calls'), 'calls')}
${detailsTable(model, unit, callers.length, calls.length)}
${model.mode === 'frame' ? details(model, system, unit, model.spec.impacts[id]) : ''}
${findings.length ? html`<section class="findings"><h2>${icon('warning')}Findings</h2>${findings.map((finding) => html`<div class="finding"><em>${FINDING_TITLES[finding.kind]}</em>${finding.text}</div>`)}</section>` : ''}</div>`
}

export { FINDING_TITLES }
