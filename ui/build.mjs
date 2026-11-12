import { build } from 'esbuild'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const HERE = import.meta.dirname
const OUT = join(HERE, '..', 'viewer')
const TARGET = ['chrome110', 'firefox110', 'safari16']

const bundle = async (entryPoint, options = {}) => (await build({ entryPoints: [join(HERE, 'src', entryPoint)], bundle: true, write: false, minify: true, target: TARGET, ...options })).outputFiles[0].text

const style = await bundle('style.css', { loader: { '.css': 'css' } })
const standalone = await bundle('standalone.ts', { format: 'esm' })
const library = await bundle('index.ts', { format: 'esm', minify: false })

const page = readFileSync(join(HERE, 'index.html'), 'utf8').replace('/*STYLE*/', () => style.trim()).replace('/*SCRIPT*/', () => standalone.trim())
writeFileSync(join(OUT, 'index.html'), page)
writeFileSync(join(OUT, 'code-atlas-ui.js'), library)
writeFileSync(join(OUT, 'code-atlas-ui.css'), style)
console.log(`viewer/index.html ${(page.length / 1024).toFixed(1)} KB`)
