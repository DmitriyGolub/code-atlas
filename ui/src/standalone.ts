import type { EditorName, Spec } from './types'
import { mount } from './viewer'
import { loadAtlas } from './modules'

async function loadConfig(): Promise<{ root?: string; editor?: EditorName }> {
  try {
    return await (await fetch('config.json')).json()
  } catch {
    return {}
  }
}

async function loadSpec(element: HTMLElement): Promise<Spec> {
  try {
    return await loadAtlas()
  } catch {
    element.innerHTML = '<p class="hint">The browser cannot read the map from disk. Run <code>npx code-atlas serve</code>, or pick code-atlas.json.</p><input type="file" accept=".json">'
    const picker = element.querySelector('input')!
    return new Promise((resolve) => picker.addEventListener('change', async () => resolve(JSON.parse(await picker.files![0].text()))))
  }
}

const element = document.getElementById('code-atlas')!
const [config, spec] = await Promise.all([loadConfig(), loadSpec(element)])
mount(element, spec, { ...config, syncHash: true })
