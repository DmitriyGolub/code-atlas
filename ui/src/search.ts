import type { Unit } from './types'
import { html } from './markup'

const SEARCHABLE = new Set(['system', 'rule', 'component', 'entity', 'query', 'outside'])

export function wireSearch(units: Unit[], search: HTMLInputElement, results: HTMLElement, select: (id: string) => void): void {
  const searchable = units.filter((unit) => SEARCHABLE.has(unit.kind))
  search.addEventListener('input', () => {
    const query = search.value.trim().toLowerCase()
    if (!query) return void (results.hidden = true)
    const rankOf = (name: string) => (name.toLowerCase() === query ? 0 : name.toLowerCase().startsWith(query) ? 1 : 2)
    const found = searchable.filter((unit) => unit.name.toLowerCase().includes(query)).sort((first, second) => rankOf(first.name) - rankOf(second.name)).slice(0, 40)
    results.innerHTML = (found.length
      ? html`${found.map((unit) => html`<div data-go="${unit.id}"><span>${unit.name}</span><small>${unit.kind} · ${unit.file.split('/').slice(-2).join('/')}</small></div>`)}`
      : html`<div><small>nothing found</small></div>`).markup
    results.hidden = false
  })
  search.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return
    const first = results.querySelector<HTMLElement>('[data-go]')
    if (first) { select(first.dataset.go!); results.hidden = true }
  })
}
