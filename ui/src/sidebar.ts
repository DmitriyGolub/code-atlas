import { html, type Markup } from './markup'
import type { Model } from './model'
import { icon, type IconName } from './icons'

export const FILTER_KINDS = [
  { kind: 'system', label: 'System', color: 'var(--accent)' },
  { kind: 'component', label: 'Component', color: 'var(--tag)' },
  { kind: 'tag', label: 'Tag', color: 'var(--fresh)' },
  { kind: 'event', label: 'Event', color: 'var(--event)' },
  { kind: 'port', label: 'Port', color: 'var(--port)' },
] as const

export function renderFilters(active: Set<string>): Markup {
  return html`${FILTER_KINDS.map(({ kind, label, color }) => html`<label class="filter"><input type="checkbox" data-filter="${kind}"${active.has(kind) ? html` checked` : ''}><i style="border-color:${color}"></i>${label}</label>`)}`
}

const unique = (values: string[]) => new Set(values).size

export function renderMetrics(model: Model): Markup {
  const { spec, systems } = model
  const rows: [string, number, IconName][] = [['Symbols', spec.units.length, 'code'], ['Files', unique(spec.units.map((unit) => unit.file)), 'file']]
  if (model.mode === 'frame') {
    rows.push(
      ['Systems', systems.length, 'cpu'],
      ['Components', spec.units.filter((unit) => unit.kind === 'component').length, 'box'],
      ['Events', unique(systems.flatMap((system) => [...system.eventReads, ...system.eventWrites].map((item) => item.value))), 'bolt'],
      ['Tags', unique(systems.flatMap((system) => [...system.adds, ...system.removes].map((item) => item.value))), 'filter'],
      ['Findings', spec.findings.length, 'warning'],
    )
  } else {
    rows.push(['Folders', unique(spec.units.map((unit) => unit.file.split('/').slice(0, -1).join('/'))), 'folder'], ['Documented', spec.units.filter((unit) => unit.doc).length, 'doc'])
  }
  rows.push(['Tests', spec.tests.length, 'flask'])
  return html`${rows.map(([label, value, name]) => html`<div class="metric"><span>${icon(name)}${label}</span><b>${value.toLocaleString('en-US')}</b></div>`)}`
}

export function renderStats(model: Model): Markup {
  const pill = (value: number, label: string, name: IconName) => html`<span class="pill">${icon(name)}<b>${value.toLocaleString('en-US')}</b> ${label}</span>`
  return html`${pill(model.spec.units.length, 'symbols', 'code')}${pill(model.spec.tests.length, 'tests', 'flask')}${model.mode === 'frame' ? pill(model.systems.length, 'systems', 'cpu') : ''}`
}
