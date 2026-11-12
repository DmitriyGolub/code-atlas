import type { Access, Impact, System, Unit } from './types'
import { componentsOf, firstPerValue, relations, shortName, type Model, excludedComponent } from './model'
import { html, type Markup } from './markup'
import { chip, chips, fact, linkList, nothing } from './cardParts'

export function details(model: Model, system: System | undefined, unit: Unit, impact: Impact | undefined): Markup {
  const lines = (items: Access[]) => firstPerValue(items).map((item) => html`<div class="line"><span>${item.value}</span>${model.source(item)}</div>`)
  const block = (title: string, body: Markup[]) => html`<h3>${title}</h3>${body.length ? body : nothing}`
  const parts: Markup[] = []
  if (system) {
    parts.push(block('Reads', lines(system.reads)), block('Writes', lines(system.writes)))
    if (system.rules.length) parts.push(block('Rules it runs', firstPerValue(system.rules).map((item) => html`<div class="line"><span class="chip go" data-go="${item.value}">${item.value.split('#')[1]}</span>${model.source(item)}</div>`)))
  }
  if (unit.callers.length) parts.push(block('Called by', unit.callers.map((caller) => html`<div class="line"><span class="chip go" data-go="${caller.unit}">${caller.name}</span>${model.source(caller)}</div>`)))
  if (impact?.tests.length) parts.push(block('Tests', impact.tests.map((test) => html`<div class="line"><span>${test.title}</span>${model.source(test)}</div>`)))
  return parts.length ? html`<details><summary>Details</summary><div class="inner">${parts}</div></details>` : html``
}

export function ecsFacts(model: Model, id: string): Markup[] {
  const unit = model.units.get(id)!
  const system = unit.kind === 'system' ? model.systemByName.get(unit.name) : undefined
  const impact = model.spec.impacts[id]
  const flow = relations(model, id)
  const rows: Markup[] = []
  if (system) {
    const terms = system.queries.flatMap((query) => query.terms)
    const takes = [...new Set(terms.filter((term) => !excludedComponent(term)))].map((term) => chip(model, term))
    const excludes = [...new Set(terms.map(excludedComponent).filter((term): term is string => !!term))].map((term) => chip(model, term, 'not'))
    const firstWrite = (component: string) => firstPerValue(system.writes).find((item) => item.value.startsWith(`${component}.`)) ?? null
    const changes = [
      ...componentsOf(system.writes).map((component) => chip(model, component, '', firstWrite(component))),
      ...firstPerValue(system.adds).map((item) => chip(model, `+${item.value}`, 'add', item)),
      ...firstPerValue(system.removes).map((item) => chip(model, `−${item.value}`, 'remove', item)),
      ...firstPerValue(system.eventWrites).map((item) => chip(model, `events.${item.value}`, 'event', item)),
      ...firstPerValue(system.ports).map((item) => chip(model, item.value, 'port', item)),
      ...firstPerValue(system.creates).map((item) => chip(model, `${item.value}()`, '', item)),
    ]
    rows.push(fact('Takes', chips([...takes, ...excludes])), fact('Gets from', linkList(model, flow.upstream), 'in'), fact('Gives to', linkList(model, flow.downstream), 'out'), fact('Changes', chips(changes)))
  } else if (unit.kind === 'component') {
    rows.push(fact('Written by', linkList(model, flow.upstream), 'in'), fact('Read by', linkList(model, flow.downstream), 'out'))
  } else {
    rows.push(fact('Runs in', chips((impact?.executing ?? []).map((name) => chip(model, shortName(name), '', null, model.idOf(name))))))
    const changes = impact ? [...componentsOf(impact.writesFields.map((value) => ({ value }))).map((name) => chip(model, name)), ...impact.writesTags.map((tag) => chip(model, tag, 'add')), ...impact.emits.map((event) => chip(model, `events.${event}`, 'event'))] : []
    rows.push(fact('Changes', chips(changes), 'out'), fact('Read by', linkList(model, flow.downstream), 'out'))
    if (impact?.contracts.length) rows.push(fact('Contracts', chips(impact.contracts.map((item) => chip(model, item.name, '', item)))))
  }
  return rows
}
