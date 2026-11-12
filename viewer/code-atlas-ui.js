// ui/src/markup.ts
var ENTITIES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
var escapeText = (text) => text.replace(/[&<>"]/g, (character) => ENTITIES[character]);
var isMarkup = (value) => typeof value === "object" && value !== null && "markup" in value;
function render(value) {
  if (isMarkup(value)) return value.markup;
  if (Array.isArray(value)) return value.map(render).join("");
  if (value === null || value === void 0 || value === false) return "";
  return escapeText(String(value));
}
var raw = (markup) => ({ markup });
var html = (strings, ...values) => raw(strings.reduce((output, part, index) => output + render(values[index - 1]) + part));
var isEmpty = (value) => value.markup === "";

// ui/src/kinds.ts
var DECORATOR_LABELS = {
  Controller: "controller",
  Injectable: "service",
  Module: "module",
  Catch: "filter",
  Resolver: "resolver",
  Gateway: "gateway",
  WebSocketGateway: "gateway",
  Component: "angular component",
  Directive: "directive",
  Pipe: "pipe",
  NgModule: "module",
  Entity: "entity"
};
var ENDPOINT_DECORATORS = /* @__PURE__ */ new Set(["Get", "Post", "Put", "Patch", "Delete", "Options", "Head", "All", "GrpcMethod", "MessagePattern", "EventPattern", "Query", "Mutation", "Subscription", "SubscribeMessage"]);
var NAMED_KINDS = /* @__PURE__ */ new Set(["system", "component", "rule", "entity", "query", "config"]);
var RULES = [
  { label: (unit) => unit.kind, matches: (unit) => NAMED_KINDS.has(unit.kind) },
  { label: () => "endpoint", matches: (unit) => unit.kind === "method" && (unit.decorators ?? []).some((name) => ENDPOINT_DECORATORS.has(name)) },
  { label: () => "method", matches: (unit) => unit.kind === "method" },
  { label: (unit) => DECORATOR_LABELS[(unit.decorators ?? []).find((name) => name in DECORATOR_LABELS)], matches: (unit) => (unit.decorators ?? []).some((name) => name in DECORATOR_LABELS) },
  { label: () => "class", matches: (_, isClass) => isClass },
  { label: () => "hook", matches: (unit) => /^use[A-Z]/.test(unit.name) },
  { label: () => "constant", matches: (unit) => /^[A-Z][A-Z0-9_]*$/.test(unit.name) },
  { label: () => "react component", matches: (unit) => /^[A-Z]/.test(unit.name) && unit.file.endsWith(".tsx") },
  { label: () => "value", matches: (unit) => /^[A-Z]/.test(unit.name) },
  { label: () => "function", matches: () => true }
];
var classes = /* @__PURE__ */ new Set();
var registerClasses = (units) => {
  classes = new Set(units.map((unit) => unit.owner).filter((owner) => !!owner));
};
var kindLabel = (unit) => {
  const isClass = classes.has(unit.id) || !!unit.decorators?.length && unit.kind !== "method";
  return RULES.find((rule) => rule.matches(unit, isClass)).label(unit);
};

// ui/src/model.ts
var COLUMN_WIDTH = 170;
var ROW_HEIGHT = 36;
var EDITORS = {
  vscode: "vscode://file/{path}:{line}",
  cursor: "cursor://file/{path}:{line}",
  webstorm: "webstorm://open?file={path}&line={line}",
  zed: "zed://file/{path}:{line}"
};
function createModel(spec, root = "", editor = "vscode") {
  const systems = spec.systems;
  const systemByName = new Map(systems.map((system) => [system.name, system]));
  const units = new Map(spec.units.map((unit) => [unit.id, unit]));
  const domains = [...new Set(systems.map((system) => system.domain))];
  const layout = /* @__PURE__ */ new Map();
  domains.forEach((domain, column) => {
    systems.filter((system) => system.domain === domain).forEach((system, row) => layout.set(system.name, { x: column * COLUMN_WIDTH, y: 30 + row * ROW_HEIGHT }));
  });
  const allEdges = spec.edges.filter((edge) => !edge.hub);
  const members2 = /* @__PURE__ */ new Map();
  for (const unit of spec.units) if (unit.owner) members2.set(unit.owner, [...members2.get(unit.owner) ?? [], unit]);
  registerClasses(spec.units);
  const tests = /* @__PURE__ */ new Map();
  for (const test of spec.tests) for (const symbol of test.symbols ?? []) tests.set(symbol, [...tests.get(symbol) ?? [], test]);
  const pattern = EDITORS[editor] ?? EDITORS.vscode;
  const href = (item) => root ? pattern.replace("{path}", `${root}/${item.file}`).replace("{line}", String(item.line)) : "#";
  return {
    spec,
    mode: systems.length ? "frame" : "code",
    codeNodes: [],
    systems,
    systemByName,
    units,
    domains,
    layout,
    height: Math.max(0, ...[...layout.values()].map((point) => point.y)) + 60,
    fresh: new Set(spec.fresh ?? []),
    flagged: new Set(spec.findings.map((finding) => finding.system)),
    allEdges,
    edges: allEdges.filter((edge) => !edge.excluded),
    testsOf: (id) => tests.get(id) ?? [],
    membersOf: (id) => members2.get(id) ?? [],
    idOf: (name) => systemByName.get(name)?.id ?? spec.units.find((unit) => unit.name === name)?.id,
    href,
    source: (item) => html`<a class="source" href="${href(item)}" title="${item.file}:${item.line}">${item.file.split("/").slice(-2).join("/")}:${item.line}</a>`
  };
}
var EXCLUDED_TERM = /^not\((.*)\)$/i;
var excludedComponent = (term) => term.match(EXCLUDED_TERM)?.[1] ?? null;
var shortName = (name) => name.replace(/System$/, "");
var viaText = (via) => via.replace("component:", "").replace("event:", "events.");
var firstPerValue = (items) => [...new Map(items.map((item) => [item.value, item])).values()];
var componentsOf = (items) => [...new Set(items.map((item) => item.value.split(".")[0]))];
var frameStep = (model, system) => system.position ? `#${system.position} of ${model.spec.frame.length} in frame` : "not in the frame pipeline";
function relations(model, id) {
  const unit = model.units.get(id);
  const impact = model.spec.impacts[id];
  const group = (list, key) => {
    const byName = /* @__PURE__ */ new Map();
    for (const edge of list) {
      if (!byName.has(edge[key])) byName.set(edge[key], { name: edge[key], vias: /* @__PURE__ */ new Set() });
      byName.get(edge[key]).vias.add(viaText(edge.via));
    }
    return [...byName.values()];
  };
  const readers = (impact?.readers ?? []).map((reader) => ({ name: reader.name, vias: new Set(reader.through) }));
  if (unit.kind === "system") {
    return { upstream: group(model.edges.filter((edge) => edge.to === unit.name), "from"), downstream: group(model.edges.filter((edge) => edge.from === unit.name), "to") };
  }
  if (unit.kind === "component") {
    return { upstream: (impact?.writers ?? []).map((writer) => ({ name: writer.name, vias: new Set(writer.accesses.map((access) => access.value)) })), downstream: readers };
  }
  return { upstream: unit.callers.map((caller) => ({ name: caller.name, vias: /* @__PURE__ */ new Set(["calls"]) })), downstream: readers };
}

// ui/src/frame.ts
var RANK = { event: 0, tag: 1, field: 2 };
var NODE_INSET = 14;
function highlightOf(model, selected) {
  if (!selected) return { center: null, related: /* @__PURE__ */ new Set(), writers: /* @__PURE__ */ new Set() };
  const unit = model.units.get(selected);
  if (unit.kind === "system") {
    const touching = model.edges.filter((edge) => edge.from === unit.name || edge.to === unit.name);
    return { center: unit.name, related: new Set(touching.flatMap((edge) => [edge.from, edge.to])), writers: /* @__PURE__ */ new Set() };
  }
  const flow = relations(model, selected);
  return { center: null, related: new Set(flow.downstream.map((entry) => entry.name)), writers: new Set(flow.upstream.map((entry) => entry.name)) };
}
function curve(from, to) {
  let x1 = from.x + COLUMN_WIDTH - NODE_INSET;
  const y1 = from.y + NODE_INSET;
  let x2 = to.x;
  const y2 = to.y + NODE_INSET;
  if (from.x === to.x) {
    x2 = to.x + COLUMN_WIDTH - NODE_INSET;
    return `M${x1},${y1} C${x1 + 40},${y1} ${x2 + 40},${y2} ${x2},${y2}`;
  }
  let pull = Math.max(50, Math.abs(x2 - x1) * 0.45);
  if (x2 < x1) {
    x1 = from.x;
    x2 = to.x + COLUMN_WIDTH - NODE_INSET;
    pull = -pull;
  }
  return `M${x1},${y1} C${x1 + pull},${y1} ${x2 - pull},${y2} ${x2},${y2}`;
}
function renderFrame(model, selected, showFields) {
  const { center, related, writers } = highlightOf(model, selected);
  const active = Boolean(center || related.size || writers.size);
  const pairs = /* @__PURE__ */ new Map();
  for (const edge of model.edges) {
    if (!showFields && edge.kind === "field" && !(center && (edge.from === center || edge.to === center))) continue;
    const key = `${edge.from}>${edge.to}`;
    const current = pairs.get(key);
    if (!current || RANK[edge.kind] < RANK[current.kind]) pairs.set(key, { ...edge, vias: [...current?.vias ?? [], edge.via] });
    else current.vias.push(edge.via);
  }
  const width = model.domains.length * COLUMN_WIDTH;
  const paths = [...pairs.values()].map((edge) => {
    const lit = center ? edge.from === center || edge.to === center : writers.has(edge.from) || related.has(edge.to);
    const state = active ? lit ? "lit" : "dim" : "";
    return html`<path class="${[edge.kind, edge.nextFrame ? "next" : "", state].filter(Boolean).join(" ")}" d="${curve(model.layout.get(edge.from), model.layout.get(edge.to))}"><title>${edge.vias.map(viaText).join(", ")}</title></path>`;
  });
  const columns = model.domains.map((domain, column) => html`<div class="column" style="left:${column * COLUMN_WIDTH}px;width:${COLUMN_WIDTH - 10}px;height:${model.height}px"><b>${domain}</b></div>`);
  const nodes = model.systems.map((system) => {
    const point = model.layout.get(system.name);
    const state = system.name === center ? "selected" : writers.has(system.name) ? "writer" : related.has(system.name) ? "related" : active ? "dim" : "";
    const classes2 = ["node", model.fresh.has(system.name) ? "fresh" : "", model.flagged.has(system.name) ? "flagged" : "", state].filter(Boolean).join(" ");
    const step = system.position ? `runs #${system.position} in every frame` : "not in the frame pipeline";
    return html`<div class="${classes2}" data-id="${system.id}" style="left:${point.x}px;top:${point.y}px;width:${COLUMN_WIDTH - NODE_INSET}px" title="${system.name} ${step}"><span>${shortName(system.name)}</span><small>${system.position || "\u2013"}${system.planned ? " \u270E" : ""}</small></div>`;
  });
  return html`${columns}<svg width="${width}" height="${model.height}">${paths}</svg>${nodes}`;
}

// ui/src/codeMap.ts
var COLUMNS = 10;
var ROWS = 18;
var KINDS = /* @__PURE__ */ new Set(["rule", "entity", "outside", "system", "component"]);
var CONSTANT = /^[A-Z0-9_]+$/;
var folderOf = (unit) => unit.file.split("/").slice(1, -1).slice(0, 2).join("/") || unit.file.split("/")[0];
function layoutCode(model, sort) {
  const byFolder = /* @__PURE__ */ new Map();
  for (const unit of model.spec.units) {
    if (!KINDS.has(unit.kind) || !unit.callers.length || CONSTANT.test(unit.name)) continue;
    byFolder.set(folderOf(unit), [...byFolder.get(folderOf(unit)) ?? [], unit]);
  }
  const weight = (list) => list.reduce((sum, unit) => sum + unit.callers.length, 0);
  const order = sort === "name" ? (first, second) => first.name.localeCompare(second.name) : (first, second) => second.callers.length - first.callers.length;
  const folders = [...byFolder].sort((first, second) => weight(second[1]) - weight(first[1])).slice(0, COLUMNS);
  if (sort === "name") folders.sort((first, second) => first[0].localeCompare(second[0]));
  model.domains = [];
  model.codeNodes = [];
  model.layout.clear();
  folders.forEach(([folder, list], column) => {
    model.domains.push(folder);
    const top = [...list].sort((first, second) => second.callers.length - first.callers.length).slice(0, ROWS).sort(order);
    top.forEach((unit, row) => {
      model.codeNodes.push(unit);
      model.layout.set(unit.id, { x: column * COLUMN_WIDTH, y: 30 + row * ROW_HEIGHT });
    });
  });
  model.height = Math.max(0, ...[...model.layout.values()].map((point) => point.y)) + 60;
}
function renderCodeMap(model, selected) {
  const shown = new Set(model.codeNodes.map((unit) => unit.id));
  const links = /* @__PURE__ */ new Map();
  for (const unit of model.codeNodes) {
    for (const call of unit.calls ?? []) if (shown.has(call.unit) && call.unit !== unit.id) links.set(`${unit.id}>${call.unit}`, { from: unit.id, to: call.unit });
  }
  const touches = (link) => link.from === selected || link.to === selected;
  const related = new Set([...links.values()].filter(touches).flatMap((link) => [link.from, link.to]));
  const active = Boolean(selected && shown.has(selected));
  const paths = [...links.values()].map((link) => html`<path class="call${active ? touches(link) ? " lit" : " dim" : ""}" d="${curve(model.layout.get(link.from), model.layout.get(link.to))}"/>`);
  const columns = model.domains.map((domain, column) => html`<div class="column" style="left:${column * COLUMN_WIDTH}px;width:${COLUMN_WIDTH - 10}px;height:${model.height}px"><b title="${domain}">${domain}</b></div>`);
  const nodes = model.codeNodes.map((unit) => {
    const point = model.layout.get(unit.id);
    const state = unit.id === selected ? "selected" : related.has(unit.id) ? "related" : active ? "dim" : "";
    return html`<div class="${["node", state].filter(Boolean).join(" ")}" data-id="${unit.id}" style="left:${point.x}px;top:${point.y}px;width:${COLUMN_WIDTH - NODE_INSET}px" title="${unit.name} · ${unit.kind} · ${unit.callers.length} callers"><span>${unit.name}</span><small>${unit.callers.length}</small></div>`;
  });
  return html`${columns}<svg width="${model.domains.length * COLUMN_WIDTH}" height="${model.height}">${paths}</svg>${nodes}`;
}

// ui/src/icons.ts
var PATHS = {
  graph: '<circle cx="5" cy="12" r="2"/><circle cx="19" cy="5" r="2"/><circle cx="19" cy="19" r="2"/><path d="M7 11l10-5M7 13l10 5"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
  box: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9"/>',
  bolt: '<path d="M13 3L5 13h6l-1 8 8-10h-6z"/>',
  code: '<path d="M9 8l-4 4 4 4M15 8l4 4-4 4"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  filter: '<path d="M4 5h16l-6 8v5l-4 2v-7z"/>',
  chart: '<path d="M5 20V10M12 20V4M19 20v-7"/>',
  flask: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3"/>',
  callers: '<path d="M20 12H8M12 8l-4 4 4 4"/><path d="M4 5v14"/>',
  calls: '<path d="M4 12h12M12 8l4 4-4 4"/><path d="M20 5v14"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M9 13h6M9 17h4"/>',
  flow: '<path d="M4 6h6v4H4zM14 14h6v4h-6zM10 8h2a2 2 0 0 1 2 2v6"/>',
  cpu: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
  warning: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17h.01"/>'
};
var icon = (name) => raw(`<svg class="icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name]}</svg>`);

// ui/src/layout.ts
var SHAPES = raw('<span class="shapes"><svg width="20" height="12"><rect x="1" y="1" width="18" height="10" rx="4" fill="#262a30" stroke="#5a5e66"/></svg>system<svg width="20" height="12"><rect x="1" y="1" width="18" height="10" rx="1" fill="#1d2024" stroke="#5a5e66"/><line x1="1" y1="6" x2="19" y2="6" stroke="#5a5e66"/></svg>component<svg width="20" height="12"><rect x="1" y="1" width="18" height="10" rx="5" fill="#1d2420" stroke="#63c98a"/></svg>tag<svg width="20" height="12"><path d="M5,1 H19 L15,11 H1 Z" fill="#1c2230" stroke="#6aa8e8"/></svg>event<svg width="20" height="12"><path d="M1,1 H13 L19,6 L13,11 H1 Z" fill="#251f2c" stroke="#c792ea"/></svg>port</span>');
var DOCK_HEAD = (prefix, close) => html`
<div class="dock-head">
  <div class="tabs small" data-part="${prefix}-tabs"><button type="button" class="ecs-only" data-dock-tab="data">${icon("flow")}Data flow</button><button type="button" data-dock-tab="calls">${icon("graph")}Dependencies</button></div>
  <div class="segmented" data-part="${prefix}-direction"><button type="button" data-direction="in">Inbound</button><button type="button" data-direction="both">Both</button><button type="button" data-direction="out">Outbound</button></div>
  <b class="dock-title" data-part="${prefix}-title"></b>
  <button type="button" data-part="${close ? "close" : "expand"}">${close ? "Close" : "Expand"}</button>${close ? "" : html`<button type="button" class="collapse-inline" data-panel="dock" title="Hide the flow panel">˅</button>`}
</div>`;
var LAYOUT = html`
<header>
  <div class="brand"><b data-part="title">Code Atlas</b><span class="subtitle">Code structure · Dependencies · Data flow</span></div>
  <nav class="tabs" data-part="views"></nav>
  <div class="search"><input type="search" data-part="search" placeholder="Search symbols" autocomplete="off" aria-label="Search symbols"><div class="results" data-part="results" hidden></div></div>
  <div class="pills" data-part="stats"></div>
</header>
<nav class="sidebar" data-part="sidebar" aria-label="Project">
  <section class="panel"><div class="panel-head"><button type="button" class="chevron" data-collapse><span>${icon("folder")}Project</span></button></div><div class="panel-body tree" data-part="tree"></div></section>
  <section class="panel ecs-only"><div class="panel-head"><button type="button" class="chevron" data-collapse><span>${icon("filter")}Show in flow</span></button><button type="button" class="link" data-part="filters-reset">Reset</button></div><div class="panel-body" data-part="filters"></div></section>
  <section class="panel"><div class="panel-head"><button type="button" class="chevron" data-collapse><span>${icon("chart")}Metrics</span></button></div><div class="panel-body" data-part="metrics"></div></section>
</nav>
<main>
  <button type="button" class="edge edge-left" data-panel="sidebar" title="Show or hide the project panel"></button>
  <button type="button" class="edge edge-right" data-panel="aside" title="Show or hide the symbol card"></button>
  <div class="toolbar" data-part="toolbar">
    <div class="zoom"><button type="button" data-zoom="out" title="Zoom out">−</button><span data-part="zoom-level">100%</span><button type="button" data-zoom="in" title="Zoom in">+</button><button type="button" data-zoom="fit" title="Fit to width">Fit</button></div>
    <label class="toggle ecs-only" title="Also draw links made only of component data"><input type="checkbox" data-part="fields"> data links</label>
    <label class="toggle ecs-only" title="Also draw links through Not() terms"><input type="checkbox" data-part="excluded"> Not()</label>
    <label class="toggle code-only">Sort <select data-part="sort"><option value="callers">by callers</option><option value="name">by name</option></select></label>
    <span class="legend ecs-only"><span><i class="line event"></i>event</span><span><i class="line tag"></i>tag</span><span><i class="line field"></i>data</span><span><i class="line next"></i>next frame</span><span class="number">7</span>step</span>
    <span class="legend code-only"><span><i class="line event"></i>call</span><span class="number">12</span>callers</span>
  </div>
  <div class="frame" data-part="frame"><div class="canvas" data-part="canvas"></div></div>
  <div class="list" data-part="list" hidden></div>
  <button type="button" class="rail rail-bottom" data-panel="dock" title="Show the flow panel">˄ Flow</button>
  <section class="dock" data-part="dock" hidden>${DOCK_HEAD("dock", false)}
    <div class="dock-body"><div class="flow" data-part="dock-flow"></div><div class="flow-info" data-part="dock-info" hidden></div></div>
  </section>
</main>
<aside data-part="aside">
  <section data-part="card"><p class="hint">Pick a symbol on the map, in the project tree, or search.</p></section>
  <section class="findings" data-part="findings" hidden></section>
</aside>
<div class="overlay" data-part="overlay" hidden>${DOCK_HEAD("overlay", true)}
  <div class="dock-body"><div class="flow" data-part="overlay-flow"></div><div class="flow-info" data-part="overlay-info" hidden></div></div>
</div>`;

// ui/src/scroll.ts
var MARGIN = 24;
function scrollIntoContainer(container, element, center = false) {
  if (!element) return;
  const outer = container.getBoundingClientRect();
  const box = element.getBoundingClientRect();
  const vertical = center ? box.top - outer.top - (outer.height - box.height) / 2 : box.top < outer.top + MARGIN ? box.top - outer.top - MARGIN : box.bottom > outer.bottom - MARGIN ? box.bottom - outer.bottom + MARGIN : 0;
  const horizontal = box.left < outer.left + MARGIN ? box.left - outer.left - MARGIN : box.right > outer.right - MARGIN ? box.right - outer.right + MARGIN : 0;
  container.scrollBy({ top: vertical, left: horizontal });
}

// ui/src/tree.ts
var SHOWN = /* @__PURE__ */ new Set(["system", "component", "rule", "entity", "outside", "query", "method"]);
var emptyFolder = () => ({ folders: /* @__PURE__ */ new Map(), files: /* @__PURE__ */ new Map() });
function buildTree(units) {
  const root = emptyFolder();
  for (const unit of units) {
    if (!SHOWN.has(unit.kind)) continue;
    const parts = unit.file.split("/");
    const file = parts.pop();
    let folder = root;
    for (const part of parts) folder = folder.folders.get(part) ?? folder.folders.set(part, emptyFolder()).get(part);
    folder.files.set(file, [...folder.files.get(file) ?? [], unit]);
  }
  return root;
}
var countOf = (folder) => [...folder.files.values()].reduce((sum, list) => sum + list.length, 0) + [...folder.folders.values()].reduce((sum, child) => sum + countOf(child), 0);
function renderFolder(folder, depth) {
  const byName = (entries) => [...entries].sort(([first], [second]) => first.localeCompare(second));
  const folders = byName(folder.folders).map(([name, child]) => html`<details${depth < 1 ? html` open` : ""}><summary><span>${icon("folder")}${name}</span><small>${countOf(child)}</small></summary>${renderFolder(child, depth + 1)}</details>`);
  const files = byName(folder.files).map(([name, units]) => html`<details><summary class="file"><span>${icon("file")}${name}</span><small>${units.length}</small></summary>${[...units].sort((first, second) => first.line - second.line).map((unit) => html`<div class="tree-item kind-${unit.kind}${unit.owner ? " member" : ""}" data-go="${unit.id}" data-tree-id="${unit.id}" title="${unit.name} · line ${unit.line}"><i></i>${unit.owner ? unit.name.split(".").pop() : unit.name}</div>`)}</details>`);
  return html`<div class="tree-level">${folders}${files}</div>`;
}
var renderTree = (units) => renderFolder(buildTree(units), 0);
function revealInTree(tree, id) {
  tree.querySelector(".tree-item.current")?.classList.remove("current");
  const item = tree.querySelector(`[data-tree-id="${CSS.escape(id)}"]`);
  if (!item) return;
  item.classList.add("current");
  for (let parent = item.parentElement; parent && parent !== tree; parent = parent.parentElement) if (parent instanceof HTMLDetailsElement) parent.open = true;
  scrollIntoContainer(tree, item);
}

// ui/src/search.ts
var SEARCHABLE = /* @__PURE__ */ new Set(["system", "rule", "component", "entity", "query", "outside"]);
function wireSearch(units, search, results, select) {
  const searchable = units.filter((unit) => SEARCHABLE.has(unit.kind));
  search.addEventListener("input", () => {
    const query = search.value.trim().toLowerCase();
    if (!query) return void (results.hidden = true);
    const rankOf = (name) => name.toLowerCase() === query ? 0 : name.toLowerCase().startsWith(query) ? 1 : 2;
    const found = searchable.filter((unit) => unit.name.toLowerCase().includes(query)).sort((first, second) => rankOf(first.name) - rankOf(second.name)).slice(0, 40);
    results.innerHTML = (found.length ? html`${found.map((unit) => html`<div data-go="${unit.id}"><span>${unit.name}</span><small>${unit.kind} · ${unit.file.split("/").slice(-2).join("/")}</small></div>`)}` : html`<div><small>nothing found</small></div>`).markup;
    results.hidden = false;
  });
  search.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    const first = results.querySelector("[data-go]");
    if (first) {
      select(first.dataset.go);
      results.hidden = true;
    }
  });
}

// ui/src/cardParts.ts
var FINDING_TITLES = { "next-frame": "one frame late", wide: "wide system", "write-only": "write-only field" };
var nothing = html`<span class="none">nothing</span>`;
var fact = (title, body, kind = "") => html`<div class="fact ${kind}"><b>${title}</b><div>${isEmpty(body) ? nothing : body}</div></div>`;
var chips = (list) => list.length ? html`<div class="chips">${list}</div>` : html``;
function chip(model, text, kind = "", at = null, go = void 0) {
  if (at) return html`<a class="chip ${kind}" href="${model.href(at)}" title="${at.file}:${at.line}">${text}</a>`;
  if (go) return html`<span class="chip ${kind} go" data-go="${go}">${text}</span>`;
  return html`<span class="chip ${kind}">${text}</span>`;
}
function linkList(model, entries) {
  const byVia = /* @__PURE__ */ new Map();
  for (const entry of entries) {
    const key = [...entry.vias].join(", ");
    byVia.set(key, [...byVia.get(key) ?? [], entry]);
  }
  return html`${[...byVia].map(([via, list]) => html`<div class="link"><span class="via">${via}</span>${chips(list.map((entry) => chip(model, shortName(entry.name), "", null, model.idOf(entry.name))))}</div>`)}`;
}

// ui/src/cardEcs.ts
function details(model, system, unit, impact) {
  const lines = (items) => firstPerValue(items).map((item) => html`<div class="line"><span>${item.value}</span>${model.source(item)}</div>`);
  const block2 = (title, body) => html`<h3>${title}</h3>${body.length ? body : nothing}`;
  const parts = [];
  if (system) {
    parts.push(block2("Reads", lines(system.reads)), block2("Writes", lines(system.writes)));
    if (system.rules.length) parts.push(block2("Rules it runs", firstPerValue(system.rules).map((item) => html`<div class="line"><span class="chip go" data-go="${item.value}">${item.value.split("#")[1]}</span>${model.source(item)}</div>`)));
  }
  if (unit.callers.length) parts.push(block2("Called by", unit.callers.map((caller) => html`<div class="line"><span class="chip go" data-go="${caller.unit}">${caller.name}</span>${model.source(caller)}</div>`)));
  if (impact?.tests.length) parts.push(block2("Tests", impact.tests.map((test) => html`<div class="line"><span>${test.title}</span>${model.source(test)}</div>`)));
  return parts.length ? html`<details><summary>Details</summary><div class="inner">${parts}</div></details>` : html``;
}
function ecsFacts(model, id) {
  const unit = model.units.get(id);
  const system = unit.kind === "system" ? model.systemByName.get(unit.name) : void 0;
  const impact = model.spec.impacts[id];
  const flow = relations(model, id);
  const rows = [];
  if (system) {
    const terms = system.queries.flatMap((query) => query.terms);
    const takes = [...new Set(terms.filter((term) => !excludedComponent(term)))].map((term) => chip(model, term));
    const excludes = [...new Set(terms.map(excludedComponent).filter((term) => !!term))].map((term) => chip(model, term, "not"));
    const firstWrite = (component) => firstPerValue(system.writes).find((item) => item.value.startsWith(`${component}.`)) ?? null;
    const changes = [
      ...componentsOf(system.writes).map((component) => chip(model, component, "", firstWrite(component))),
      ...firstPerValue(system.adds).map((item) => chip(model, `+${item.value}`, "add", item)),
      ...firstPerValue(system.removes).map((item) => chip(model, `\u2212${item.value}`, "remove", item)),
      ...firstPerValue(system.eventWrites).map((item) => chip(model, `events.${item.value}`, "event", item)),
      ...firstPerValue(system.ports).map((item) => chip(model, item.value, "port", item)),
      ...firstPerValue(system.creates).map((item) => chip(model, `${item.value}()`, "", item))
    ];
    rows.push(fact("Takes", chips([...takes, ...excludes])), fact("Gets from", linkList(model, flow.upstream), "in"), fact("Gives to", linkList(model, flow.downstream), "out"), fact("Changes", chips(changes)));
  } else if (unit.kind === "component") {
    rows.push(fact("Written by", linkList(model, flow.upstream), "in"), fact("Read by", linkList(model, flow.downstream), "out"));
  } else {
    rows.push(fact("Runs in", chips((impact?.executing ?? []).map((name) => chip(model, shortName(name), "", null, model.idOf(name))))));
    const changes = impact ? [...componentsOf(impact.writesFields.map((value) => ({ value }))).map((name) => chip(model, name)), ...impact.writesTags.map((tag) => chip(model, tag, "add")), ...impact.emits.map((event) => chip(model, `events.${event}`, "event"))] : [];
    rows.push(fact("Changes", chips(changes), "out"), fact("Read by", linkList(model, flow.downstream), "out"));
    if (impact?.contracts.length) rows.push(fact("Contracts", chips(impact.contracts.map((item) => chip(model, item.name, "", item)))));
  }
  return rows;
}

// ui/src/coverage.ts
var MAX_DEPTH = 4;
var MAX_SYMBOLS = 400;
function coverageOf(model, id) {
  const direct = model.testsOf(id);
  const seen = /* @__PURE__ */ new Set([id]);
  const found = /* @__PURE__ */ new Map();
  for (const test of direct) found.set(`${test.file}:${test.line}`, { test, through: "", depth: 0 });
  let frontier = [id];
  for (let depth = 1; depth <= MAX_DEPTH && frontier.length && seen.size < MAX_SYMBOLS; depth++) {
    const next = [];
    for (const current of frontier) {
      for (const caller of model.units.get(current)?.callers ?? []) {
        if (seen.has(caller.unit) || !model.units.has(caller.unit)) continue;
        seen.add(caller.unit);
        next.push(caller.unit);
        for (const test of model.testsOf(caller.unit)) {
          const key = `${test.file}:${test.line}`;
          if (!found.has(key)) found.set(key, { test, through: caller.name, depth });
        }
      }
    }
    frontier = next;
  }
  return { direct, indirect: [...found.values()].filter((entry) => entry.depth > 0) };
}

// ui/src/summary.ts
var LISTED = 3;
var folderOf2 = (file) => file.split("/").slice(0, -1).filter((part) => part !== "src").slice(-2).join("/") || ".";
var areaOf = (file) => file.split("/").filter((part) => part !== "src").slice(0, 2).join("/");
var names = (list) => list.slice(0, LISTED).join(", ") + (list.length > LISTED ? ` and ${list.length - LISTED} more` : "");
function summaryOf(model, unit) {
  const callers = [...new Set(unit.callers.map((caller) => caller.name))];
  const calls = [...new Set((unit.calls ?? []).map((call) => call.name))];
  const areas = new Set(unit.callers.map((caller) => areaOf(caller.file)));
  const { direct, indirect } = coverageOf(model, unit.id);
  const label2 = kindLabel(unit);
  const parts = [`${label2[0].toUpperCase()}${label2.slice(1)} in ${folderOf2(unit.file)}.`];
  const system = model.systemByName.get(unit.name);
  if (system) {
    const components = (list) => [...new Set(list.map((item) => item.value.split(".")[0]))];
    if (system.position) parts.push(`Runs at step ${system.position} of ${model.spec.frame.length}.`);
    if (system.reads.length) parts.push(`Reads ${names(components(system.reads))}.`);
    if (system.writes.length) parts.push(`Writes ${names(components(system.writes))}.`);
    if (system.eventWrites.length) parts.push(`Emits ${names([...new Set(system.eventWrites.map((item) => `events.${item.value}`))])}.`);
  }
  parts.push(callers.length ? `Used by ${callers.length} ${callers.length === 1 ? "symbol" : "symbols"}${areas.size > 1 ? ` across ${areas.size} areas` : ""}: ${names(callers.map(shortName))}.` : "Nothing in the project calls it.");
  if (calls.length) parts.push(`Calls ${names(calls.map(shortName))}.`);
  parts.push(direct.length ? `${direct.length} ${direct.length === 1 ? "test calls" : "tests call"} it directly.` : "No test calls it directly.");
  if (indirect.length) parts.push(`${indirect.length} more ${indirect.length === 1 ? "test reaches" : "tests reach"} it through callers.`);
  return parts.join(" ");
}

// ui/src/card.ts
var SHOWN_CHIPS = 12;
var LEVELS = [[5, "low"], [10, "medium"], [Infinity, "high"]];
var collapsed = /* @__PURE__ */ new Set();
var block = (key, title, body, count, name = "info") => html`<section class="block${collapsed.has(key) ? " collapsed" : ""}"><button type="button" class="block-head" data-block="${key}">${icon(name)}<h3>${title}</h3>${count === void 0 ? "" : html`<span class="count">${count}</span>`}</button><div class="block-body">${body}</div></section>`;
var distinct = (list) => [...new Map(list.map((entry) => [entry.unit, entry])).values()];
function linkGroup(model, title, entries, expanded, key) {
  if (!entries.length) return html``;
  const shown = expanded ? entries : entries.slice(0, SHOWN_CHIPS);
  const more = entries.length - shown.length;
  return block(key, title, html`<div class="chips">${shown.map((entry) => chip(model, entry.name, "", null, model.units.has(entry.unit) ? entry.unit : void 0))}${more > 0 ? html`<button type="button" class="chip more" data-expand="${key}">+ ${more} more</button>` : ""}</div>`, entries.length, key);
}
function members(model, unit, expanded) {
  const list = model.membersOf(unit.id);
  if (!list.length) return html``;
  const shown = expanded.has("methods") ? list : list.slice(0, SHOWN_CHIPS);
  const more = list.length - shown.length;
  return block("methods", "Methods", html`<div class="chips">${shown.map((member) => chip(model, member.name.split(".").pop(), kindLabel(member) === "endpoint" ? "event" : "", null, member.id))}${more > 0 ? html`<button type="button" class="chip more" data-expand="methods">+ ${more} more</button>` : ""}</div>`, list.length, "code");
}
function detailsTable(model, unit, callers, calls) {
  const complexity = unit.complexity ?? 1;
  const level = LEVELS.find(([limit]) => complexity <= limit)[1];
  const system = model.systemByName.get(unit.name);
  const row = (label2, value) => html`<tr><th>${label2}</th><td>${value}</td></tr>`;
  return block("details", "Details", html`<table class="details">
${unit.owner && model.units.has(unit.owner) ? row("Class", chip(model, model.units.get(unit.owner).name, "", null, unit.owner)) : ""}${(unit.decorators ?? []).length ? row("Decorators", (unit.decorators ?? []).map((name) => `@${name}`).join(" ")) : ""}${row("Called by", `${callers} symbols`)}${row("Calls", `${calls} symbols`)}${row("File", model.source(unit))}${row("Kind", kindLabel(unit))}
${system ? row("Frame", `${frameStep(model, system)} \xB7 ${system.phase}`) : ""}${row("Exported", unit.exported ? "yes" : "no")}${row("Lines", String(unit.lines ?? "\u2013"))}
${row("Complexity", html`<span class="meter ${level}"><i style="width:${Math.min(100, complexity * 6)}%"></i></span>${level} (${complexity})`)}
</table>`);
}
var SHOWN_INDIRECT = 20;
var coverageCount = (model, id) => {
  const { direct, indirect } = coverageOf(model, id);
  return direct.length + indirect.length;
};
function testsOf(model, id) {
  const { direct, indirect } = coverageOf(model, id);
  const simulated = model.spec.impacts[id]?.simulationTests ?? 0;
  const line = (title, at, note = "") => html`<div class="line"><span title="${title}">${title}${note ? html` <small>${note}</small>` : ""}</span>${model.source(at)}</div>`;
  return html`${block("tests", "Tests that call it", html`${direct.length ? direct.map((test) => line(test.title, test)) : html`<p class="none">No test calls it directly.</p>`}`, direct.length, "flask")}
${indirect.length ? block("indirect", "Tests that reach it through callers", html`${indirect.slice(0, SHOWN_INDIRECT).map((entry) => line(entry.test.title, entry.test, `via ${entry.through}`))}${indirect.length > SHOWN_INDIRECT ? html`<p class="hint">and ${indirect.length - SHOWN_INDIRECT} more</p>` : ""}`, indirect.length, "flask") : ""}
${simulated ? html`<p class="hint">${simulated} more tests run the whole frame and reach it indirectly.</p>` : ""}`;
}
function renderCard(model, id, tab, expanded, folded) {
  collapsed = folded;
  const unit = model.units.get(id);
  const callers = distinct(unit.callers);
  const calls = distinct(unit.calls ?? []);
  const findings = model.spec.findings.filter((finding) => finding.system === unit.name);
  const header = html`<div class="identity"><div class="name" title="${unit.name}">${unit.name}</div><div class="row"><span class="badge ${unit.kind}">${kindLabel(unit)}</span>${unit.planned ? html`<span class="badge stub">stub</span>` : ""}${model.source(unit)}</div>
${unit.doc ? html`<p class="doc">${unit.doc}</p>` : html`<p class="doc generated" title="Built from the code. Add a /** */ comment above the declaration to replace it, code-atlas docs lists the symbols that need one most.">${summaryOf(model, unit)}</p>`}</div>`;
  const tabs = html`<div class="tabs small card-tabs">${["overview", "tests"].map((name) => html`<button type="button" data-card-tab="${name}" class="${tab === name ? "active" : ""}">${icon(name === "overview" ? "info" : "flask")}${name === "overview" ? "Overview" : html`Tests <span class="count">${coverageCount(model, id)}</span>`}</button>`)}</div>`;
  if (tab === "tests") return html`<div class="card-body">${header}${tabs}${testsOf(model, id)}</div>`;
  const system = unit.kind === "system" ? model.systemByName.get(unit.name) : void 0;
  const ecs = model.mode === "frame" ? ecsFacts(model, id) : [];
  return html`<div class="card-body">${header}${tabs}
${ecs.length ? block("data", "Data", html`<div class="facts">${ecs}</div>`, void 0, "flow") : ""}
${members(model, unit, expanded)}${linkGroup(model, "Callers", callers, expanded.has("callers"), "callers")}${linkGroup(model, "Calls", calls, expanded.has("calls"), "calls")}
${detailsTable(model, unit, callers.length, calls.length)}
${model.mode === "frame" ? details(model, system, unit, model.spec.impacts[id]) : ""}
${findings.length ? html`<section class="findings"><h2>${icon("warning")}Findings</h2>${findings.map((finding) => html`<div class="finding"><em>${FINDING_TITLES[finding.kind]}</em>${finding.text}</div>`)}</section>` : ""}</div>`;
}

// ui/src/sidebar.ts
var FILTER_KINDS = [
  { kind: "system", label: "System", color: "var(--accent)" },
  { kind: "component", label: "Component", color: "var(--tag)" },
  { kind: "tag", label: "Tag", color: "var(--fresh)" },
  { kind: "event", label: "Event", color: "var(--event)" },
  { kind: "port", label: "Port", color: "var(--port)" }
];
function renderFilters(active) {
  return html`${FILTER_KINDS.map(({ kind, label: label2, color }) => html`<label class="filter"><input type="checkbox" data-filter="${kind}"${active.has(kind) ? html` checked` : ""}><i style="border-color:${color}"></i>${label2}</label>`)}`;
}
var unique = (values) => new Set(values).size;
function renderMetrics(model) {
  const { spec, systems } = model;
  const rows = [["Symbols", spec.units.length, "code"], ["Files", unique(spec.units.map((unit) => unit.file)), "file"]];
  if (model.mode === "frame") {
    rows.push(
      ["Systems", systems.length, "cpu"],
      ["Components", spec.units.filter((unit) => unit.kind === "component").length, "box"],
      ["Events", unique(systems.flatMap((system) => [...system.eventReads, ...system.eventWrites].map((item) => item.value))), "bolt"],
      ["Tags", unique(systems.flatMap((system) => [...system.adds, ...system.removes].map((item) => item.value))), "filter"],
      ["Findings", spec.findings.length, "warning"]
    );
  } else {
    rows.push(["Folders", unique(spec.units.map((unit) => unit.file.split("/").slice(0, -1).join("/"))), "folder"], ["Documented", spec.units.filter((unit) => unit.doc).length, "doc"]);
  }
  rows.push(["Tests", spec.tests.length, "flask"]);
  return html`${rows.map(([label2, value, name]) => html`<div class="metric"><span>${icon(name)}${label2}</span><b>${value.toLocaleString("en-US")}</b></div>`)}`;
}
function renderStats(model) {
  const pill = (value, label2, name) => html`<span class="pill">${icon(name)}<b>${value.toLocaleString("en-US")}</b> ${label2}</span>`;
  return html`${pill(model.spec.units.length, "symbols", "code")}${pill(model.spec.tests.length, "tests", "flask")}${model.mode === "frame" ? pill(model.systems.length, "systems", "cpu") : ""}`;
}

// ui/src/listView.ts
var LIMIT = 600;
var viewsOf = (model) => {
  const views = model.mode === "frame" ? [["graph", "Graph", "graph"], ["tree", "Tree", "folder"], ["systems", "Systems", "cpu"], ["components", "Components", "box"], ["events", "Events", "bolt"], ["symbols", "Symbols", "code"]] : [["graph", "Graph", "graph"], ["tree", "Tree", "folder"], ["symbols", "Symbols", "code"]];
  return model.spec.modules ? [...views.slice(0, 2), ["modules", "Modules", "box"], ...views.slice(2)] : views;
};
function table(model, view) {
  const { spec, systems } = model;
  if (view === "systems") return { heads: ["System", "Domain", "Step", "Reads", "Writes", "Findings"], rows: systems.map((system) => ({ go: system.id, cells: [shortName(system.name), system.domain, system.position || "\u2013", new Set(system.reads.map((item) => item.value.split(".")[0])).size, new Set(system.writes.map((item) => item.value.split(".")[0])).size, spec.findings.filter((finding) => finding.system === system.name).length] })) };
  if (view === "components") return { heads: ["Component", "Written by", "Read by", "File"], rows: spec.units.filter((unit) => unit.kind === "component").map((unit) => ({ go: unit.id, cells: [unit.name, spec.impacts[unit.id]?.writers.length ?? 0, spec.impacts[unit.id]?.readers.length ?? 0, unit.file] })) };
  if (view === "modules") {
    const links = spec.links ?? [];
    const total = (path, side) => links.filter((link) => link[side] === path).reduce((sum, link) => sum + link.calls, 0);
    const uses = (path) => links.filter((link) => link.from === path).slice(0, 3).map((link) => `${link.to} (${link.calls})`).join(", ");
    return { heads: ["Module", "Symbols", "Tests", "Calls out", "Calls in", "Uses most"], rows: (spec.modules ?? []).map((module) => ({ cells: [module.path, module.units, module.tests, total(module.path, "from"), total(module.path, "to"), uses(module.path)] })) };
  }
  if (view === "events") {
    const names2 = [...new Set(systems.flatMap((system) => [...system.eventReads, ...system.eventWrites].map((item) => item.value)))];
    const who = (name, side) => systems.filter((system) => system[side].some((item) => item.value === name)).map((system) => shortName(system.name)).join(", ");
    return { heads: ["Event", "Emitted by", "Read by"], rows: names2.map((name) => ({ cells: [`events.${name}`, who(name, "eventWrites"), who(name, "eventReads")] })) };
  }
  return { heads: ["Symbol", "Kind", "Callers", "Calls", "Tests", "Lines", "Complexity", "File"], rows: spec.units.map((unit) => ({ go: unit.id, cells: [unit.name, kindLabel(unit), unit.callers.length, unit.calls?.length ?? 0, model.testsOf(unit.id).length, unit.lines ?? 0, unit.complexity ?? 0, unit.file] })) };
}
var compare = (first, second) => typeof first === "number" && typeof second === "number" ? first - second : String(first).localeCompare(String(second));
function renderList(model, view, sorting, selected) {
  const { heads, rows } = table(model, view);
  const sorted = [...rows].sort((first, second) => compare(first.cells[sorting.column], second.cells[sorting.column]) * (sorting.descending ? -1 : 1));
  const marker = (index) => index === sorting.column ? sorting.descending ? " \u2193" : " \u2191" : "";
  return html`<table><thead><tr>${heads.map((head, index) => html`<th data-sort="${index}" class="${index === sorting.column ? "sorted" : ""}">${head}${marker(index)}</th>`)}</tr></thead>
<tbody>${sorted.slice(0, LIMIT).map((row) => html`<tr${row.go ? html` data-go="${row.go}"` : ""} class="${row.go && row.go === selected ? "current" : ""}">${row.cells.map((cell) => html`<td title="${cell}">${cell}</td>`)}</tr>`)}</tbody></table>
${sorted.length > LIMIT ? html`<p class="hint">Showing ${LIMIT} of ${sorted.length}. Search to find the rest.</p>` : ""}`;
}

// ui/src/flowGraph.ts
function buildDataFlow(model, id) {
  const unit = model.units.get(id);
  const impact = model.spec.impacts[id];
  const columns = [];
  const links = [];
  const push = (column, node) => {
    while (columns.length <= column) columns.push([]);
    if (!columns[column].some((item) => item.key === node.key)) columns[column].push(node);
    return node.key;
  };
  const link = (from, to, kind, dashed = false) => {
    if (!links.some((item) => item.from === from && item.to === to)) links.push({ from, to, kind, dashed });
  };
  const systemNode = (name, side) => {
    const system = model.systemByName.get(name);
    return { key: `${side}:${name}`, title: shortName(name), sub: system?.position ? `#${system.position} in frame` : "", kind: "system", go: model.idOf(name) };
  };
  const fieldsOf = (items, component) => [...new Set(items.filter((item) => item.value.split(".")[0] === component).map((item) => item.value.split(".")[1]))].filter((field) => field && field !== "*" && field !== "query");
  if (unit.kind === "system") {
    const system = model.systemByName.get(unit.name);
    const center2 = push(2, { key: "center", title: shortName(unit.name), sub: frameStep(model, system), kind: "center" });
    const queried = new Set(system.queries.flatMap((query) => query.terms).filter((term) => !excludedComponent(term)));
    for (const component of /* @__PURE__ */ new Set([...queried, ...system.reads.map((item) => item.value.split(".")[0])])) {
      const fields = fieldsOf(system.reads, component);
      const filterOnly = queried.has(component) && !fields.length;
      link(push(1, { key: `in:${component}`, title: component, sub: fields.length ? `reads ${fields.join(" ")}` : filterOnly ? "filter only, no data read" : "", kind: filterOnly ? "tag" : "field" }), center2, "field");
    }
    for (const event of new Set(system.eventReads.map((item) => item.value))) {
      link(push(1, { key: `in:event:${event}`, title: `events.${event}`, sub: "event received", kind: "event" }), center2, "event");
    }
    for (const edge of model.edges.filter((item) => item.to === unit.name)) {
      const target = edge.via.startsWith("event:") ? `in:event:${edge.via.slice(6)}` : `in:${edge.via.slice(10)}`;
      if (!columns[1]?.some((node) => node.key === target)) continue;
      link(push(0, systemNode(edge.from, "writer")), target, edge.kind, edge.nextFrame);
    }
    const outputs = /* @__PURE__ */ new Map();
    for (const component of new Set(system.writes.map((item) => item.value.split(".")[0]))) {
      outputs.set(`component:${component}`, push(3, { key: `out:${component}`, title: component, sub: `writes ${fieldsOf(system.writes, component).join(" ")}`, kind: "field" }));
    }
    for (const item of system.adds) outputs.set(`component:${item.value}`, outputs.get(`component:${item.value}`) ?? push(3, { key: `out:tag:${item.value}`, title: `+${item.value}`, sub: "tag added", kind: "tag" }));
    for (const item of system.removes) outputs.set(`component:${item.value}`, outputs.get(`component:${item.value}`) ?? push(3, { key: `out:tag:${item.value}`, title: `\u2212${item.value}`, sub: "tag removed", kind: "remove" }));
    for (const item of system.eventWrites) outputs.set(`event:${item.value}`, push(3, { key: `out:event:${item.value}`, title: `events.${item.value}`, sub: "event emitted", kind: "event" }));
    for (const item of system.ports) push(3, { key: `out:port:${item.value}`, title: item.value, sub: `port: output to ${item.value.split(".")[0]}`, kind: "port" });
    for (const item of system.creates) push(3, { key: `out:create:${item.value}`, title: `${item.value}()`, sub: "creates an entity", kind: "field" });
    for (const node of columns[3] ?? []) link(center2, node.key, node.kind === "remove" ? "tag" : node.kind);
    for (const edge of model.edges.filter((item) => item.from === unit.name)) {
      const from = outputs.get(edge.via);
      if (from) link(from, push(4, systemNode(edge.to, "reader")), edge.kind, edge.nextFrame);
    }
    return { columns, links, heads: ["Written by", "Reads", "", "Changes", "Read by"] };
  }
  if (unit.kind === "component") {
    const center2 = push(1, { key: "center", title: unit.name, sub: "component", kind: "center" });
    for (const writer of impact?.writers ?? []) {
      const changed = [...new Set(writer.accesses.map((access) => access.value.replace(`${unit.name}.`, "")))].join(" ");
      link(push(0, { ...systemNode(writer.name, "writer"), sub: changed }), center2, writer.accesses.some((access) => /^[+-]/.test(access.value)) ? "tag" : "field");
    }
    for (const reader of impact?.readers ?? []) {
      link(center2, push(2, { ...systemNode(reader.name, "reader"), sub: reader.through.map((value) => value.replace(`${unit.name}.`, "")).join(" ") }), "field");
    }
    return { columns, links, heads: ["Written by", "", "Read by"] };
  }
  const center = push(1, { key: "center", title: unit.name, sub: kindLabel(unit), kind: "center" });
  for (const caller of unit.callers) link(push(0, { key: `caller:${caller.unit}`, title: caller.name, sub: model.units.has(caller.unit) ? kindLabel(model.units.get(caller.unit)) : "", kind: "system", go: model.units.has(caller.unit) ? caller.unit : void 0 }), center, "call");
  const written = /* @__PURE__ */ new Map();
  for (const field of impact?.writesFields ?? []) {
    const component = field.split(".")[0];
    const fields = impact.writesFields.filter((value) => value.startsWith(`${component}.`)).map((value) => value.split(".")[1]);
    written.set(`component:${component}`, push(2, { key: `out:${component}`, title: component, sub: fields.join(" "), kind: "field" }));
  }
  for (const tag of impact?.writesTags ?? []) written.set(`component:${tag}`, written.get(`component:${tag}`) ?? push(2, { key: `out:tag:${tag}`, title: tag, sub: "tag", kind: "tag" }));
  for (const event of impact?.emits ?? []) written.set(`event:${event}`, push(2, { key: `out:event:${event}`, title: `events.${event}`, sub: "", kind: "event" }));
  for (const node of columns[2] ?? []) link(center, node.key, node.kind);
  for (const reader of impact?.readers ?? []) {
    for (const through of reader.through) {
      const isEvent = through.startsWith("events.");
      const from = written.get(isEvent ? `event:${through.slice(7)}` : `component:${through.split(".")[0].replace(" (tag)", "")}`);
      if (from) link(from, push(3, systemNode(reader.name, "reader")), isEvent ? "event" : "field");
    }
  }
  return { columns, links, heads: ["Called by", "", "Changes", "Read by"] };
}
function buildCallFlow(model, id) {
  const unit = model.units.get(id);
  const node = (side, entry) => ({ key: `${side}:${entry.unit}`, title: model.units.get(entry.unit)?.owner === id ? entry.name.split(".").pop() : entry.name, sub: model.units.has(entry.unit) ? kindLabel(model.units.get(entry.unit)) : "", kind: "system", go: model.units.has(entry.unit) ? entry.unit : void 0 });
  const distinct2 = (list) => [...new Map(list.map((entry) => [entry.unit, entry])).values()];
  const callers = distinct2(unit.callers).map((entry) => node("caller", entry));
  const members2 = model.membersOf(id).map((member) => ({ unit: member.id, name: member.name }));
  const calls = distinct2(members2.length ? members2 : unit.calls ?? []).map((entry) => node("callee", entry));
  const center = { key: "center", title: shortName(unit.name), sub: kindLabel(unit), kind: "center" };
  return {
    columns: [callers, [center], calls],
    links: [...callers.map((item) => ({ from: item.key, to: "center", kind: "call" })), ...calls.map((item) => ({ from: "center", to: item.key, kind: "call" }))],
    heads: [`Called by \xB7 ${callers.length}`, "", `${members2.length ? "Methods" : "Calls"} \xB7 ${calls.length}`]
  };
}
function buildFlow(model, id, tab, direction) {
  const flow = tab === "calls" || model.mode === "code" ? buildCallFlow(model, id) : buildDataFlow(model, id);
  const center = flow.columns.findIndex((column) => column.some((node) => node.key === "center"));
  const keep = (index) => direction === "both" || index === center || (direction === "in" ? index < center : index > center);
  const columns = flow.columns.map((column, index) => keep(index) ? column : []);
  const shown = new Set(columns.flat().map((node) => node.key));
  const kept = columns.map((column, index) => [column, flow.heads[index] ?? ""]).filter(([column], index) => column.length || index === center);
  return { columns: kept.map(([column]) => column), heads: kept.map(([, head]) => head), links: flow.links.filter((link) => shown.has(link.from) && shown.has(link.to)) };
}

// ui/src/flow.ts
var KIND_COLORS = {
  event: "var(--event)",
  tag: "var(--tag)",
  remove: "var(--bad)",
  field: "var(--field)",
  port: "var(--port)",
  call: "var(--muted)",
  system: "var(--field)"
};
var STROKES = {
  field: "var(--line-strong)",
  tag: "var(--tag)",
  remove: "var(--bad)",
  event: "var(--event)",
  port: "var(--port)",
  system: "var(--line-strong)",
  center: "var(--accent)"
};
function shapeOf(model, id, node) {
  if (/^(writer|reader|caller|callee):/.test(node.key)) return "system";
  if (node.key === "center") return model.units.get(id).kind === "component" ? "component" : "system";
  if (node.key.includes(":event:")) return "event";
  if (node.key.startsWith("out:port:")) return "port";
  if (node.key.startsWith("out:create:")) return "create";
  if (node.key.startsWith("out:tag:") || node.kind === "tag") return "tag";
  return "component";
}
function outline(shape, x, y, width, height) {
  if (shape === "tag") return html`<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${height / 2}"/>`;
  if (shape === "event") return html`<path d="M${x + 10},${y} H${x + width} L${x + width - 10},${y + height} H${x} Z"/>`;
  if (shape === "port") return html`<path d="M${x},${y} H${x + width - 14} L${x + width},${y + height / 2} L${x + width - 14},${y + height} H${x} Z"/>`;
  if (shape === "create") return html`<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="3" stroke-dasharray="4 3"/>`;
  if (shape === "component") return html`<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="2"/><line class="table-line" x1="${x}" y1="${y + height / 2}" x2="${x + width}" y2="${y + height / 2}"/>`;
  return html`<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="8"/>`;
}
var clip = (text, length) => text.length > length ? `${text.slice(0, length - 1)}\u2026` : text;
function drawFlow(model, container, id, roomy, view, focus = null) {
  const built = buildFlow(model, id, view.tab, view.direction);
  const filterKind = (node) => ({ create: "component" })[shapeOf(model, id, node)] ?? shapeOf(model, id, node);
  const visible = (node) => node.key === "center" || !view.only.size || view.only.has(filterKind(node));
  const columns = built.columns.map((column) => column.filter(visible));
  const keys = new Set(columns.flat().map((node) => node.key));
  const flow = { ...built, columns, links: built.links.filter((link) => keys.has(link.from) && keys.has(link.to)) };
  const touching = focus ? flow.links.filter((item) => item.from === focus || item.to === focus) : [];
  const near = /* @__PURE__ */ new Set([focus, ...touching.flatMap((item) => [item.from, item.to])]);
  const nodeHeight = roomy ? 38 : 32;
  const gap = roomy ? 10 : 6;
  const count = flow.columns.length;
  const available = container.clientWidth - 24;
  const nodeWidth = Math.max(120, Math.min(roomy ? 220 : 180, (available - 40 - (count - 1) * 40) / count));
  const columnGap = Math.max(40, Math.min(roomy ? 120 : 80, (available - 40 - count * nodeWidth) / Math.max(1, count - 1)));
  const rows = Math.max(1, ...flow.columns.map((column) => column.length));
  const width = Math.max(available, count * nodeWidth + (count - 1) * columnGap + 40);
  const spacing = count > 1 ? (width - 40 - count * nodeWidth) / (count - 1) : 0;
  const totalHeight = rows * (nodeHeight + gap) + 20;
  const place2 = /* @__PURE__ */ new Map();
  flow.columns.forEach((column, index) => {
    const x = 20 + index * (nodeWidth + spacing);
    const top = 10 + (totalHeight - 10 - column.length * (nodeHeight + gap)) / 2;
    column.forEach((node, row) => place2.set(node.key, { x, y: top + row * (nodeHeight + gap), node }));
  });
  const heads = flow.heads.map((title, index) => title ? html`<div class="flow-title" style="left:${20 + index * (nodeWidth + spacing)}px;width:${nodeWidth}px"><b>${title}</b></div>` : "");
  const edges = flow.links.map((item) => {
    const from = place2.get(item.from);
    const to = place2.get(item.to);
    if (!from || !to) return "";
    const x1 = from.x + nodeWidth;
    const y1 = from.y + nodeHeight / 2;
    const x2 = to.x;
    const y2 = to.y + nodeHeight / 2;
    const middle = (x1 + x2) / 2;
    const state = focus ? touching.includes(item) ? " lit" : " dim" : "";
    return html`<path class="flow-edge${state}" stroke="${KIND_COLORS[item.kind]}"${item.dashed ? raw(' stroke-dasharray="5 5"') : ""} d="M${x1},${y1} C${middle},${y1} ${middle},${y2} ${x2},${y2}"/>`;
  });
  const nodes = [...place2.values()].map(({ x, y, node }) => {
    const shape = shapeOf(model, id, node);
    const inset = shape === "event" || shape === "tag" ? 14 : 10;
    const state = focus ? node.key === focus ? " focused" : near.has(node.key) || node.kind === "center" ? "" : " dim" : "";
    const textY = node.sub ? shape === "component" ? y + nodeHeight / 2 - 4 : y + nodeHeight / 2 - 2 : y + nodeHeight / 2 + 4;
    const subY = shape === "component" ? y + nodeHeight - 5 : y + nodeHeight / 2 + 11;
    return html`<g class="flow-node shape-${shape}${node.kind === "center" ? " center" : ""}${state}" data-key="${node.key}"${node.go ? html` data-go="${node.go}"` : ""} style="--stroke:${STROKES[node.kind]}"><title>${shape}: ${node.title}${node.sub ? ` \xB7 ${node.sub}` : ""}</title>${outline(shape, x, y, nodeWidth, nodeHeight)}<text x="${x + inset}" y="${textY}">${clip(node.title, Math.floor(nodeWidth / 8))}</text>${node.sub ? html`<text class="sub" x="${x + inset}" y="${subY}">${clip(node.sub, Math.floor(nodeWidth / 6.5))}</text>` : ""}</g>`;
  });
  container.innerHTML = html`<div class="flow-heads" style="width:${width}px">${heads}</div><svg width="${width}" height="${totalHeight}">${edges}${nodes}</svg>`.markup;
}

// ui/src/blockInfo.ts
function holders(model, pick) {
  return model.systems.flatMap((system) => {
    const item = pick(system);
    return item ? [{ system, item }] : [];
  });
}
var matchesField = (value) => (item) => item.value === value || item.value === `${value.split(".")[0]}.*`;
function blockInfo(model, id, key) {
  const unit = model.units.get(id);
  if (!unit) return null;
  const system = model.systemByName.get(unit.name);
  if (unit.kind !== "system" || !system) return codeBlockInfo(model, id, key);
  const own = shortName(unit.name);
  const name = key.split(":").at(-1);
  const others = (list) => list.filter((entry) => entry.system.name !== unit.name);
  const who = (label2, entries) => html`<div class="who"><span class="label">${label2}</span>${entries.length ? entries.map((entry) => html`<div class="line"><span class="chip go" data-go="${entry.system.id}">${shortName(entry.system.name)}</span>${model.source(entry.item)}</div>`) : html`<span class="none">nobody in the frame</span>`}</div>`;
  const item = (label2, at, people = "") => html`<div class="item"><div class="line"><b>${label2}</b>${model.source(at)}</div>${people}</div>`;
  let title = name;
  let what = "";
  let items = [];
  if (key.startsWith("in:event:")) {
    title = `events.${name}`;
    what = `${own} reads this event`;
    items = firstPerValue(system.eventReads.filter((access) => access.value === name)).map((access) => item("read here", access, who("emitted by", holders(model, (other) => other.eventWrites.find((write) => write.value === name)))));
  } else if (key.startsWith("in:")) {
    const reads = firstPerValue(system.reads.filter((access) => access.value.split(".")[0] === name));
    const query = system.queries.find((candidate) => candidate.terms.includes(name));
    what = reads.length ? `${own} reads these fields` : `${own} only filters entities that have ${name}, it reads no data`;
    items = reads.map((access) => item(access.value, access, who("written by", others(holders(model, (other) => other.writes.find(matchesField(access.value)))))));
    if (!reads.length && query) items = [item(query.name, query, who("added or removed by", others(holders(model, (other) => [...other.adds, ...other.removes].find((change) => change.value === name)))))];
  } else if (key.startsWith("out:tag:")) {
    what = `${own} changes this tag`;
    items = firstPerValue([...system.adds, ...system.removes].filter((change) => change.value === name)).map((change) => item(`${system.adds.includes(change) ? "+" : "\u2212"}${name}`, change, who("queried by", others(holders(model, (other) => other.queries.find((candidate) => candidate.terms.includes(name) || candidate.terms.some((term) => excludedComponent(term) === name)))))));
  } else if (key.startsWith("out:event:")) {
    title = `events.${name}`;
    what = `${own} emits this event`;
    items = firstPerValue(system.eventWrites.filter((access) => access.value === name)).map((access) => item("emitted here", access, who("read by", holders(model, (other) => other.eventReads.find((read) => read.value === name)))));
  } else if (key.startsWith("out:port:")) {
    what = `Output to the ${name.split(".")[0]} adapter outside the game`;
    items = firstPerValue(system.ports.filter((access) => access.value === name)).map((access) => item("called here", access));
  } else if (key.startsWith("out:create:")) {
    what = "Creates an entity through a factory";
    items = firstPerValue(system.creates.filter((access) => access.value === name)).map((access) => item("called here", access));
  } else if (key.startsWith("out:")) {
    what = `${own} writes these fields`;
    items = firstPerValue(system.writes.filter((access) => access.value.split(".")[0] === name)).map((access) => item(access.value, access, who("read by", others(holders(model, (other) => other.reads.find(matchesField(access.value)))))));
  } else return null;
  return html`<div class="info-title"><span>${title}</span><button type="button" data-close-info>×</button></div><div class="what">${what}</div>${items}`;
}
function codeBlockInfo(model, id, key) {
  const unit = model.units.get(id);
  const title = (text, what2, body) => html`<div class="info-title"><span>${text}</span><button type="button" data-close-info>×</button></div><div class="what">${what2}</div>${body}`;
  if (key.startsWith("caller:")) {
    const calls = unit.callers.filter((caller) => caller.unit === key.slice(7));
    if (!calls.length) return null;
    return title(calls[0].name, `${calls[0].name} calls ${unit.name}`, calls.map((caller) => html`<div class="item"><div class="line"><b>called here</b>${model.source(caller)}</div></div>`));
  }
  const name = key.split(":").at(-1);
  const through = key.startsWith("out:event:") ? `events.${name}` : name;
  const readers = (model.spec.impacts[id]?.readers ?? []).filter((reader) => reader.through.some((value) => value === through || value.split(".")[0] === name));
  const what = key.startsWith("out:event:") ? `${unit.name} emits this event` : `${unit.name} changes ${name}`;
  const people = readers.length ? readers.map((reader) => html`<div class="line"><span class="chip go" data-go="${model.idOf(reader.name) ?? ""}">${shortName(reader.name)}</span><span>${reader.through.join(", ")}</span></div>`) : [html`<span class="none">nobody in the frame reads it</span>`];
  return title(through, what, [html`<div class="item"><div class="who"><span class="label">read by</span>${people}</div></div>`]);
}

// ui/src/dock.ts
var PANES = [["dock", false], ["overlay", true]];
function createDock(model, part, view) {
  let id = null;
  let focus = null;
  const overlayOpen = () => !part("overlay").hidden;
  const syncHeads = () => {
    for (const [prefix] of PANES) {
      part(`${prefix}-tabs`).querySelectorAll("[data-dock-tab]").forEach((button) => button.classList.toggle("active", button.dataset.dockTab === view.tab));
      part(`${prefix}-direction`).querySelectorAll("[data-direction]").forEach((button) => button.classList.toggle("active", button.dataset.direction === view.direction));
      if (id) part(`${prefix}-title`).textContent = model.units.get(id).name;
    }
  };
  const redraw = () => {
    if (!id) return;
    const info = focus ? blockInfo(model, id, focus) : null;
    if (!info) focus = null;
    for (const [prefix, roomy] of PANES) {
      if (roomy && !overlayOpen()) continue;
      const panel = part(`${prefix}-info`);
      panel.hidden = !info;
      if (info) panel.innerHTML = info.markup;
      drawFlow(model, part(`${prefix}-flow`), id, roomy, view, focus);
    }
    syncHeads();
  };
  return {
    show(next) {
      id = next;
      focus = null;
      part("dock").hidden = false;
      redraw();
    },
    focusBlock(key) {
      focus = key;
      redraw();
    },
    setTab(tab) {
      view.tab = tab;
      focus = null;
      redraw();
    },
    setDirection(direction) {
      view.direction = direction;
      redraw();
    },
    openOverlay() {
      if (!id) return;
      part("overlay").hidden = false;
      redraw();
    },
    closeOverlay() {
      part("overlay").hidden = true;
    },
    redraw
  };
}

// ui/src/routes.ts
var CLICK_ROUTES = [
  { selector: "[data-view]", run: (element, actions) => actions.setView(element.dataset.view) },
  { selector: "th[data-sort]", run: (element, actions) => actions.sortBy(Number(element.dataset.sort)) },
  { selector: "[data-tree-area]", run: (element, actions) => actions.setTreeArea(element.dataset.treeArea) },
  { selector: "[data-tree-toggle]", run: (element, actions) => actions.toggleTreePath(element.dataset.treeToggle) },
  { selector: "[data-dock-tab]", run: (element, actions) => actions.setDockTab(element.dataset.dockTab) },
  { selector: "[data-direction]", run: (element, actions) => actions.setDirection(element.dataset.direction) },
  { selector: "[data-card-tab]", run: (element, actions) => actions.setCardTab(element.dataset.cardTab) },
  { selector: "[data-block]", run: (element, actions) => actions.toggleBlock(element.dataset.block) },
  { selector: "[data-expand]", run: (element, actions) => actions.expandChips(element.dataset.expand) },
  { selector: "[data-zoom]", run: (element, actions) => actions.zoom(element.dataset.zoom) },
  { selector: "[data-panel]", run: (element, actions) => actions.togglePanel(element.dataset.panel) },
  { selector: "[data-collapse]", run: (element, actions) => actions.toggleSection(element.closest(".panel")) },
  { selector: ".node[data-id]", run: (element, actions) => actions.openSymbol(element.dataset.id, false) },
  { selector: ".flow-node[data-go]", run: (element, actions) => actions.openSymbol(element.dataset.go, true) },
  { selector: ".flow-node[data-key]:not(.center)", run: (element, actions) => actions.focusBlock(element.dataset.key) },
  { selector: "[data-close-info]", run: (_, actions) => actions.focusBlock(null) },
  { selector: "[data-go]", run: (element, actions) => actions.openSymbol(element.dataset.go, false) }
];
function routeClick(target, actions) {
  for (const route of CLICK_ROUTES) {
    const element = target.closest(route.selector);
    if (element) return route.run(element, actions);
  }
  if (!target.closest(".search")) actions.hideResults();
}
var toggleIn = (set, key) => {
  set.has(key) ? set.delete(key) : set.add(key);
};

// ui/src/zoom.ts
var STEPS = [0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5];
var FIT_MARGIN = 40;
var MIN_ZOOM = STEPS[0];
var MAX_ZOOM = STEPS[STEPS.length - 1];
var clamp = (value) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value));
function nextZoom(current, action, available, content) {
  if (action === "fit") return clamp(available / Math.max(1, content + FIT_MARGIN));
  const index = STEPS.findIndex((step) => step >= current - 1e-3);
  const from = index < 0 ? STEPS.length - 1 : index;
  return STEPS[Math.max(0, Math.min(STEPS.length - 1, from + (action === "in" ? 1 : -1)))];
}

// ui/src/treeView.ts
var NODE_WIDTH = 220;
var NODE_HEIGHT = 30;
var ROW_GAP = 8;
var COLUMN_GAP = 56;
var PADDING = 20;
var SHOWN_KINDS = /* @__PURE__ */ new Set(["system", "component", "rule", "entity", "outside", "query", "method"]);
var MAX_AREA_CHIPS = 10;
var ROOT_FILES = "root files";
function buildForest(units) {
  const root = { path: "", name: "", kind: "folder", children: [], symbols: 0 };
  const childOf = (parent, name, kind) => {
    const path = parent.path ? `${parent.path}/${name}` : name;
    let child = parent.children.find((item) => item.path === path);
    if (!child) parent.children.push(child = { path, name, kind, children: [], symbols: 0 });
    return child;
  };
  for (const unit of units.filter((item) => SHOWN_KINDS.has(item.kind))) {
    const parts = unit.file.split("/");
    const file = parts.pop();
    let folder = root;
    for (const part of parts) {
      folder.symbols++;
      folder = childOf(folder, part, "folder");
    }
    folder.symbols++;
    const leaf = childOf(folder, file, "file");
    leaf.symbols++;
    const node = { path: unit.id, name: unit.name.split(".").pop(), kind: "symbol", unit, children: [], symbols: 1 };
    const owner = unit.owner ? leaf.children.find((item) => item.path === unit.owner) : void 0;
    (owner ?? leaf).children.push(node);
  }
  const squash = (node) => {
    while (node.kind === "folder" && node.children.length === 1 && node.children[0].kind === "folder") {
      const only = node.children[0];
      node = { ...only, name: `${node.name}/${only.name}` };
    }
    node.children = node.children.map(squash).sort((first, second) => Number(first.kind === "file") - Number(second.kind === "file") || first.name.localeCompare(second.name));
    return node;
  };
  const top = squash(root);
  const folders = top.children.filter((node) => node.kind === "folder");
  const files = top.children.filter((node) => node.kind === "file");
  if (!files.length) return folders;
  const loose = { path: top.path || ROOT_FILES, name: top.name || ROOT_FILES, kind: "folder", children: files, symbols: files.reduce((sum, file) => sum + file.symbols, 0) };
  return [...folders, loose];
}
function place(node, state, depth, placed, next) {
  const open = node.children.length > 0 && state.expanded.has(node.path);
  const childRows = open ? node.children.map((child) => place(child, state, depth + 1, placed, next)) : [];
  const row = childRows.length ? childRows[0] : next.row++;
  placed.push({ node, depth, x: PADDING + depth * (NODE_WIDTH + COLUMN_GAP), y: PADDING + row * (NODE_HEIGHT + ROW_GAP) });
  return row;
}
var label = (node) => node.kind === "symbol" ? html`<i class="dot kind-${node.unit.kind}"></i><span>${node.name}</span><small>${node.unit.callers.length}</small>` : html`${icon(node.kind === "folder" ? "folder" : "file")}<span>${node.name}</span><small>${node.symbols}</small>`;
function areasOf(units) {
  return buildForest(units).map((node) => node.path);
}
function revealPath(state, unit, areas) {
  const area = areas.find((path) => unit.file === path || unit.file.startsWith(`${path}/`));
  if (area) state.area = area;
  const parts = unit.file.split("/");
  for (let index = 1; index <= parts.length; index++) state.expanded.add(parts.slice(0, index).join("/"));
  state.expanded.add(unit.id);
  if (unit.owner) state.expanded.add(unit.owner);
}
function renderTreeView(units, state, selected) {
  const forest = buildForest(units);
  const root = forest.find((node) => node.path === state.area) ?? forest[0];
  if (!root) return html`<p class="hint">No files.</p>`;
  state.expanded.add(root.path);
  const placed = [];
  place(root, state, 0, placed, { row: 0 });
  const byPath = new Map(placed.map((item) => [item.node.path, item]));
  const width = Math.max(...placed.map((item) => item.x)) + NODE_WIDTH + PADDING;
  const height = Math.max(...placed.map((item) => item.y)) + NODE_HEIGHT + PADDING;
  const links = placed.flatMap((parent) => (state.expanded.has(parent.node.path) ? parent.node.children : []).map((child) => {
    const end = byPath.get(child.path);
    const startX = parent.x + NODE_WIDTH;
    const middle = startX + COLUMN_GAP / 2;
    return html`<path d="M${startX},${parent.y + NODE_HEIGHT / 2} H${middle} V${end.y + NODE_HEIGHT / 2} H${end.x}"/>`;
  }));
  const nodes = placed.map(({ node, x, y }) => {
    const open = state.expanded.has(node.path);
    const action = node.kind === "symbol" ? html`data-go="${node.path}"` : html`data-tree-toggle="${node.path}"`;
    const classes2 = ["tree-node", node.kind, node.children.length ? open ? "open" : "closed" : "", node.path === selected ? "selected" : ""].filter(Boolean).join(" ");
    return html`<button type="button" class="${classes2}" ${action} style="left:${x}px;top:${y}px;width:${NODE_WIDTH}px" title="${node.path}">${label(node)}</button>`;
  });
  const areas = forest.length > MAX_AREA_CHIPS ? html`<label class="toggle">${icon("folder")}Area <select data-part="tree-area">${forest.map((node) => html`<option value="${node.path}"${node.path === root.path ? html` selected` : ""}>${node.name} · ${node.symbols}</option>`)}</select></label>` : html`${forest.map((node) => html`<button type="button" data-tree-area="${node.path}" class="${node.path === root.path ? "active" : ""}">${icon("folder")}${node.name}<span class="count">${node.symbols}</span></button>`)}`;
  return html`<div class="tree-areas">${areas}</div><div class="tree-canvas" style="width:${width}px;height:${height}px"><svg width="${width}" height="${height}">${links}</svg>${nodes}</div>`;
}

// ui/src/viewer.ts
var SIDEBAR_MIN_WIDTH = 1280;
function mount(element, spec, options = {}) {
  const model = createModel(spec, options.root, options.editor);
  element.classList.add("code-atlas", `mode-${model.mode}`);
  element.innerHTML = LAYOUT.markup;
  if (element.clientWidth < SIDEBAR_MIN_WIDTH) element.classList.add("sidebar-hidden");
  const part = (name) => element.querySelector(`[data-part="${name}"]`);
  const showFields = part("fields");
  const flowView = { tab: model.mode === "frame" ? "data" : "calls", direction: "both", only: /* @__PURE__ */ new Set() };
  const dock = createDock(model, part, flowView);
  const state = { selected: null, view: "graph", sorting: { column: 0, descending: false }, cardTab: "overview", expanded: /* @__PURE__ */ new Set(), folded: /* @__PURE__ */ new Set(), zoom: 1 };
  const treeState = { area: areasOf(spec.units)[0] ?? "", expanded: /* @__PURE__ */ new Set() };
  if (model.mode === "code") layoutCode(model, "callers");
  const drawFrame = () => {
    const canvas = part("canvas");
    canvas.style.width = `${model.domains.length * COLUMN_WIDTH}px`;
    canvas.style.height = `${model.height}px`;
    canvas.style.setProperty("zoom", String(state.zoom));
    canvas.innerHTML = (model.mode === "code" ? renderCodeMap(model, state.selected) : renderFrame(model, state.selected, showFields.checked)).markup;
    part("zoom-level").textContent = `${Math.round(state.zoom * 100)}%`;
  };
  const drawList = () => {
    if (state.view === "graph") return;
    part("list").classList.toggle("tree-view", state.view === "tree");
    part("list").innerHTML = (state.view === "tree" ? renderTreeView(spec.units, treeState, state.selected) : renderList(model, state.view, state.sorting, state.selected)).markup;
  };
  const drawViews = () => {
    part("views").innerHTML = html`${viewsOf(model).map(([view, label2, name]) => html`<button type="button" data-view="${view}" class="${view === state.view ? "active" : ""}">${icon(name)}${label2}</button>`)}`.markup;
    part("frame").hidden = state.view !== "graph";
    part("list").hidden = state.view === "graph";
    part("toolbar").hidden = state.view !== "graph";
    drawList();
  };
  const drawCard = () => {
    if (state.selected) part("card").innerHTML = renderCard(model, state.selected, state.cardTab, state.expanded, state.folded).markup;
  };
  const drawFilters = () => {
    part("filters").innerHTML = renderFilters(flowView.only).markup;
  };
  const select = (id) => {
    if (!id || !model.units.has(id)) return;
    if (id !== state.selected) state.expanded.clear();
    state.selected = id;
    drawCard();
    drawFrame();
    drawList();
    dock.show(id);
    revealInTree(part("tree"), id);
    revealPath(treeState, model.units.get(id), areasOf(spec.units));
    scrollIntoContainer(part("frame"), part("canvas").querySelector(".node.selected"));
    scrollIntoContainer(part("list"), part("list").querySelector(".tree-node.selected"));
    if (options.syncHash) {
      try {
        history.replaceState(null, "", `#${encodeURIComponent(id)}`);
      } catch {
      }
    }
  };
  const redrawSelection = () => {
    if (state.selected) select(state.selected);
  };
  const actions = {
    setView: (view) => {
      state.view = view;
      state.sorting = { column: 0, descending: false };
      drawViews();
      scrollIntoContainer(part("list"), part("list").querySelector(".tree-node.selected"), true);
    },
    sortBy: (column) => {
      state.sorting = { column, descending: state.sorting.column === column ? !state.sorting.descending : column > 0 };
      drawList();
    },
    setTreeArea: (area) => {
      treeState.area = area;
      drawList();
    },
    toggleTreePath: (path) => {
      toggleIn(treeState.expanded, path);
      drawList();
    },
    setDockTab: (tab) => dock.setTab(tab),
    setDirection: (direction) => dock.setDirection(direction),
    setCardTab: (tab) => {
      state.cardTab = tab;
      drawCard();
    },
    toggleBlock: (key) => {
      toggleIn(state.folded, key);
      drawCard();
    },
    expandChips: (key) => {
      state.expanded.add(key);
      drawCard();
    },
    zoom: (action) => {
      state.zoom = nextZoom(state.zoom, action, part("frame").clientWidth, model.domains.length * COLUMN_WIDTH);
      drawFrame();
    },
    togglePanel: (panel) => {
      element.classList.toggle(`${panel}-hidden`);
      dock.redraw();
    },
    toggleSection: (section) => section.classList.toggle("collapsed"),
    openSymbol: (id, fromFlow) => {
      if (fromFlow) dock.closeOverlay();
      part("results").hidden = true;
      select(id);
    },
    focusBlock: (key) => dock.focusBlock(key),
    hideResults: () => {
      part("results").hidden = true;
    }
  };
  const onClick = (event) => routeClick(event.target, actions);
  const onChange = (event) => {
    const target = event.target;
    if (target.dataset.filter) {
      target.checked ? flowView.only.add(target.dataset.filter) : flowView.only.delete(target.dataset.filter);
      return dock.redraw();
    }
    if (target === showFields) return drawFrame();
    if (target.dataset.part === "excluded") {
      model.edges = target.checked ? model.allEdges : model.allEdges.filter((edge) => !edge.excluded);
      drawFrame();
      redrawSelection();
    }
    if (target.dataset.part === "tree-area") return actions.setTreeArea(target.value);
    if (target.dataset.part === "sort") {
      layoutCode(model, target.value);
      drawFrame();
    }
  };
  const onKey = (event) => {
    if (event.key === "Escape") {
      dock.closeOverlay();
      part("results").hidden = true;
    }
  }, onResize = () => dock.redraw();
  const onHash = () => {
    const id = decodeURIComponent(location.hash.slice(1));
    if (id && id !== state.selected) select(id);
  };
  element.addEventListener("click", onClick);
  element.addEventListener("change", onChange);
  document.addEventListener("keydown", onKey);
  window.addEventListener("resize", onResize);
  if (options.syncHash) window.addEventListener("hashchange", onHash);
  part("expand").addEventListener("click", () => dock.openOverlay());
  part("close").addEventListener("click", () => dock.closeOverlay());
  part("filters-reset").addEventListener("click", () => {
    flowView.only.clear();
    drawFilters();
    dock.redraw();
  });
  wireSearch(spec.units, part("search"), part("results"), select);
  part("tree").innerHTML = renderTree(spec.units).markup;
  part("metrics").innerHTML = renderMetrics(model).markup;
  part("stats").innerHTML = renderStats(model).markup;
  part("title").title = `spec ${spec.codeAtlas} \xB7 source ${spec.sourceDigest}`;
  if (spec.findings.length) {
    part("findings").hidden = false;
    part("findings").innerHTML = html`<h2>Findings · ${spec.findings.length}</h2>${spec.findings.map((finding) => html`<div class="finding" data-go="${model.idOf(finding.system) ?? ""}"><em>${FINDING_TITLES[finding.kind]}</em><code>${shortName(finding.system)}</code> ${finding.text}</div>`)}`.markup;
  }
  drawFilters();
  drawViews();
  drawFrame();
  if (options.syncHash) onHash();
  return {
    select,
    destroy() {
      element.removeEventListener("click", onClick);
      element.removeEventListener("change", onChange);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("hashchange", onHash);
      element.innerHTML = "";
      element.classList.remove("code-atlas", `mode-${model.mode}`);
    }
  };
}
export {
  mount
};
