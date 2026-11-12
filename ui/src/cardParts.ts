import type { FindingKind, Location } from './types'
import { shortName, type Model, type Related } from './model'
import { html, isEmpty, type Markup } from './markup'

export const FINDING_TITLES: Record<FindingKind, string> = { 'next-frame': 'one frame late', wide: 'wide system', 'write-only': 'write-only field' }

export const nothing = html`<span class="none">nothing</span>`

export const fact = (title: string, body: Markup, kind = '') => html`<div class="fact ${kind}"><b>${title}</b><div>${isEmpty(body) ? nothing : body}</div></div>`

export const chips = (list: Markup[]) => (list.length ? html`<div class="chips">${list}</div>` : html``)

export function chip(model: Model, text: string, kind = '', at: Location | null = null, go: string | undefined = undefined): Markup {
  if (at) return html`<a class="chip ${kind}" href="${model.href(at)}" title="${at.file}:${at.line}">${text}</a>`
  if (go) return html`<span class="chip ${kind} go" data-go="${go}">${text}</span>`
  return html`<span class="chip ${kind}">${text}</span>`
}

export function linkList(model: Model, entries: Related[]): Markup {
  const byVia = new Map<string, Related[]>()
  for (const entry of entries) {
    const key = [...entry.vias].join(', ')
    byVia.set(key, [...(byVia.get(key) ?? []), entry])
  }
  return html`${[...byVia].map(([via, list]) => html`<div class="link"><span class="via">${via}</span>${chips(list.map((entry) => chip(model, shortName(entry.name), '', null, model.idOf(entry.name))))}</div>`)}`
}
