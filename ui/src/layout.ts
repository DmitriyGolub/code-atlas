import { html, raw } from './markup'
import { icon } from './icons'

export const SHAPES = raw('<span class="shapes"><svg width="20" height="12"><rect x="1" y="1" width="18" height="10" rx="4" fill="#262a30" stroke="#5a5e66"/></svg>system<svg width="20" height="12"><rect x="1" y="1" width="18" height="10" rx="1" fill="#1d2024" stroke="#5a5e66"/><line x1="1" y1="6" x2="19" y2="6" stroke="#5a5e66"/></svg>component<svg width="20" height="12"><rect x="1" y="1" width="18" height="10" rx="5" fill="#1d2420" stroke="#63c98a"/></svg>tag<svg width="20" height="12"><path d="M5,1 H19 L15,11 H1 Z" fill="#1c2230" stroke="#6aa8e8"/></svg>event<svg width="20" height="12"><path d="M1,1 H13 L19,6 L13,11 H1 Z" fill="#251f2c" stroke="#c792ea"/></svg>port</span>')

const DOCK_HEAD = (prefix: string, close: boolean) => html`
<div class="dock-head">
  <div class="tabs small" data-part="${prefix}-tabs"><button type="button" class="ecs-only" data-dock-tab="data">${icon('flow')}Data flow</button><button type="button" data-dock-tab="calls">${icon('graph')}Dependencies</button></div>
  <div class="segmented" data-part="${prefix}-direction"><button type="button" data-direction="in">Inbound</button><button type="button" data-direction="both">Both</button><button type="button" data-direction="out">Outbound</button></div>
  <b class="dock-title" data-part="${prefix}-title"></b>
  <button type="button" data-part="${close ? 'close' : 'expand'}">${close ? 'Close' : 'Expand'}</button>${close ? '' : html`<button type="button" class="collapse-inline" data-panel="dock" title="Hide the flow panel">˅</button>`}
</div>`

export const LAYOUT = html`
<header>
  <div class="brand"><b data-part="title">Code Atlas</b><span class="subtitle">Code structure · Dependencies · Data flow</span></div>
  <nav class="tabs" data-part="views"></nav>
  <div class="search"><input type="search" data-part="search" placeholder="Search symbols" autocomplete="off" aria-label="Search symbols"><div class="results" data-part="results" hidden></div></div>
  <div class="pills" data-part="stats"></div>
</header>
<nav class="sidebar" data-part="sidebar" aria-label="Project">
  <section class="panel"><div class="panel-head"><button type="button" class="chevron" data-collapse><span>${icon('folder')}Project</span></button></div><div class="panel-body tree" data-part="tree"></div></section>
  <section class="panel ecs-only"><div class="panel-head"><button type="button" class="chevron" data-collapse><span>${icon('filter')}Show in flow</span></button><button type="button" class="link" data-part="filters-reset">Reset</button></div><div class="panel-body" data-part="filters"></div></section>
  <section class="panel"><div class="panel-head"><button type="button" class="chevron" data-collapse><span>${icon('chart')}Metrics</span></button></div><div class="panel-body" data-part="metrics"></div></section>
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
  <section class="dock" data-part="dock" hidden>${DOCK_HEAD('dock', false)}
    <div class="dock-body"><div class="flow" data-part="dock-flow"></div><div class="flow-info" data-part="dock-info" hidden></div></div>
  </section>
</main>
<aside data-part="aside">
  <section data-part="card"><p class="hint">Pick a symbol on the map, in the project tree, or search.</p></section>
  <section class="findings" data-part="findings" hidden></section>
</aside>
<div class="overlay" data-part="overlay" hidden>${DOCK_HEAD('overlay', true)}
  <div class="dock-body"><div class="flow" data-part="overlay-flow"></div><div class="flow-info" data-part="overlay-info" hidden></div></div>
</div>`
