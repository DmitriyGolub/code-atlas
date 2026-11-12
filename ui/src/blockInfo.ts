import type { Access, Location, Query, System } from './types'
import { firstPerValue, shortName, type Model, excludedComponent } from './model'
import { html, type Markup } from './markup'

interface Holder {
  system: System
  item: Location
}

function holders(model: Model, pick: (system: System) => Location | undefined): Holder[] {
  return model.systems.flatMap((system) => {
    const item = pick(system)
    return item ? [{ system, item }] : []
  })
}

const matchesField = (value: string) => (item: Access) => item.value === value || item.value === `${value.split('.')[0]}.*`

export function blockInfo(model: Model, id: string, key: string): Markup | null {
  const unit = model.units.get(id)
  if (!unit) return null
  const system = model.systemByName.get(unit.name)
  if (unit.kind !== 'system' || !system) return codeBlockInfo(model, id, key)
  const own = shortName(unit.name)
  const name = key.split(':').at(-1)!
  const others = (list: Holder[]) => list.filter((entry) => entry.system.name !== unit.name)
  const who = (label: string, entries: Holder[]) =>
    html`<div class="who"><span class="label">${label}</span>${entries.length ? entries.map((entry) => html`<div class="line"><span class="chip go" data-go="${entry.system.id}">${shortName(entry.system.name)}</span>${model.source(entry.item)}</div>`) : html`<span class="none">nobody in the frame</span>`}</div>`
  const item = (label: Markup | string, at: Location, people: Markup | string = '') => html`<div class="item"><div class="line"><b>${label}</b>${model.source(at)}</div>${people}</div>`

  let title = name
  let what = ''
  let items: Markup[] = []
  if (key.startsWith('in:event:')) {
    title = `events.${name}`
    what = `${own} reads this event`
    items = firstPerValue(system.eventReads.filter((access) => access.value === name)).map((access) => item('read here', access, who('emitted by', holders(model, (other) => other.eventWrites.find((write) => write.value === name)))))
  } else if (key.startsWith('in:')) {
    const reads = firstPerValue(system.reads.filter((access) => access.value.split('.')[0] === name))
    const query = system.queries.find((candidate: Query) => candidate.terms.includes(name))
    what = reads.length ? `${own} reads these fields` : `${own} only filters entities that have ${name}, it reads no data`
    items = reads.map((access) => item(access.value, access, who('written by', others(holders(model, (other) => other.writes.find(matchesField(access.value)))))))
    if (!reads.length && query) items = [item(query.name, query, who('added or removed by', others(holders(model, (other) => [...other.adds, ...other.removes].find((change) => change.value === name)))))]
  } else if (key.startsWith('out:tag:')) {
    what = `${own} changes this tag`
    items = firstPerValue([...system.adds, ...system.removes].filter((change) => change.value === name)).map((change) =>
      item(`${system.adds.includes(change) ? '+' : '−'}${name}`, change, who('queried by', others(holders(model, (other) => other.queries.find((candidate) => candidate.terms.includes(name) || candidate.terms.some((term) => excludedComponent(term) === name)))))))
  } else if (key.startsWith('out:event:')) {
    title = `events.${name}`
    what = `${own} emits this event`
    items = firstPerValue(system.eventWrites.filter((access) => access.value === name)).map((access) => item('emitted here', access, who('read by', holders(model, (other) => other.eventReads.find((read) => read.value === name)))))
  } else if (key.startsWith('out:port:')) {
    what = `Output to the ${name.split('.')[0]} adapter outside the game`
    items = firstPerValue(system.ports.filter((access) => access.value === name)).map((access) => item('called here', access))
  } else if (key.startsWith('out:create:')) {
    what = 'Creates an entity through a factory'
    items = firstPerValue(system.creates.filter((access) => access.value === name)).map((access) => item('called here', access))
  } else if (key.startsWith('out:')) {
    what = `${own} writes these fields`
    items = firstPerValue(system.writes.filter((access) => access.value.split('.')[0] === name)).map((access) => item(access.value, access, who('read by', others(holders(model, (other) => other.reads.find(matchesField(access.value)))))))
  } else return null
  return html`<div class="info-title"><span>${title}</span><button type="button" data-close-info>×</button></div><div class="what">${what}</div>${items}`
}

function codeBlockInfo(model: Model, id: string, key: string): Markup | null {
  const unit = model.units.get(id)!
  const title = (text: string, what: string, body: Markup[]) => html`<div class="info-title"><span>${text}</span><button type="button" data-close-info>×</button></div><div class="what">${what}</div>${body}`
  if (key.startsWith('caller:')) {
    const calls = unit.callers.filter((caller) => caller.unit === key.slice(7))
    if (!calls.length) return null
    return title(calls[0].name, `${calls[0].name} calls ${unit.name}`, calls.map((caller) => html`<div class="item"><div class="line"><b>called here</b>${model.source(caller)}</div></div>`))
  }
  const name = key.split(':').at(-1)!
  const through = key.startsWith('out:event:') ? `events.${name}` : name
  const readers = (model.spec.impacts[id]?.readers ?? []).filter((reader) => reader.through.some((value) => value === through || value.split('.')[0] === name))
  const what = key.startsWith('out:event:') ? `${unit.name} emits this event` : `${unit.name} changes ${name}`
  const people = readers.length
    ? readers.map((reader) => html`<div class="line"><span class="chip go" data-go="${model.idOf(reader.name) ?? ''}">${shortName(reader.name)}</span><span>${reader.through.join(', ')}</span></div>`)
    : [html`<span class="none">nobody in the frame reads it</span>`]
  return title(through, what, [html`<div class="item"><div class="who"><span class="label">read by</span>${people}</div></div>`])
}
