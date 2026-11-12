#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { analyze } from '../src/analyze.mjs'
import { CONFIG_FILE, DEFAULT_CONFIG, loadConfig } from '../src/config.mjs'
import { serve } from '../src/serve.mjs'
import { diffSpecs, specAt } from '../src/diff.mjs'
import { diffText } from '../src/diffText.mjs'
import { detectConfig } from '../src/init.mjs'
import { docsText } from '../src/docs.mjs'
import { installAgentRules } from '../src/agents.mjs'
import { buildSpec } from '../src/spec.mjs'
import { outputsOf } from '../src/split.mjs'
import { staleOutputs, writeOutputs } from '../src/output.mjs'
import { focusText, impactText, summaryText } from '../src/text.mjs'

const HELP = `code-atlas: a living map of a codebase (systems, components, rules, data flow), built from the TypeScript AST

Usage
  code-atlas init [--print yes] [--agents no]
                                  detect folders and the frame, write ${CONFIG_FILE},
                                  add the agent skill and a section to CLAUDE.md or AGENTS.md
  code-atlas build [--since ref]  write the spec (code-atlas.json), schema and viewer to the out directory
  code-atlas check                exit 1 when the committed spec no longer matches the code
  code-atlas impact <symbol>      what changing a function, system or component affects
  code-atlas focus <system>       one system with its data, plus a Mermaid diagram of its neighbours
  code-atlas docs [--limit n]     exported symbols without a /** */ comment, most used first
  code-atlas findings             findings only
  code-atlas diff [ref] [--json yes] [--strict yes]
                                    systems, data links and findings that changed since ref (default HEAD);
                                    stubs at ref that are code now are checked against their plan;
                                    --strict exits 1 on new findings not listed in findings.accepted
  code-atlas serve [--editor vscode|cursor|webstorm|zed] [--port n]

Options
  --root <dir>   project root (default: current directory)
  --out <dir>    spec directory (default from config: out)
  --config <file> config file (default: code-atlas.config.json in the root)`

const PACKAGE = resolve(import.meta.dirname, '..')
const argumentsList = process.argv.slice(2)
const command = argumentsList[0] && !argumentsList[0].startsWith('--') ? argumentsList.shift() : 'help'
const positional = []
const options = {}
for (let i = 0; i < argumentsList.length; i++) {
  if (argumentsList[i].startsWith('--')) options[argumentsList[i].slice(2)] = argumentsList[++i]
  else positional.push(argumentsList[i])
}
const root = resolve(options.root ?? '.')

function freshSystems(config) {
  if (!options.since) return []
  const output = execFileSync('git', ['-C', root, 'diff', '--name-only', '--diff-filter=A', options.since, '--', config.layers.systems], { encoding: 'utf8' })
  return output.split('\n').filter((line) => line.endsWith(`${config.conventions.systemSuffix}.ts`)).map((line) => line.split('/').pop().replace(/\.ts$/, ''))
}

const outputsFor = (config, model) => outputsOf(config, buildSpec(model, { fresh: freshSystems(config) }))

if (command === 'help') {
  console.log(HELP)
} else if (command === 'init') {
  const file = join(root, CONFIG_FILE)
  const { config, report } = detectConfig(root)
  const text = `${JSON.stringify({ $schema: './node_modules/ts-code-atlas/schema/config.schema.json', ...config }, null, 2)}\n`
  for (const line of report) console.log(line)
  if (options.print === 'yes') console.log(`\n${text}`)
  else if (existsSync(file)) { console.error(`${CONFIG_FILE} already exists, run with --print yes to compare`); process.exit(1) }
  else {
    writeFileSync(file, text)
    console.log(`wrote ${CONFIG_FILE}`)
    if (options.agents !== 'no') for (const line of installAgentRules(root)) console.log(line)
    console.log('next: npx code-atlas build')
  }
} else {
  const config = loadConfig(root, options.config)
  const out = resolve(root, options.out ?? config.out)
  const model = analyze(config)
  if (command === 'build') {
    mkdirSync(out, { recursive: true })
    const outputs = outputsFor(config, model)
    writeOutputs(out, outputs)
    copyFileSync(join(PACKAGE, 'schema', 'code-atlas.schema.json'), join(out, 'code-atlas.schema.json'))
    copyFileSync(join(PACKAGE, 'viewer', 'index.html'), join(out, 'index.html'))
    console.log(summaryText(model).split('\n')[0])
    console.log(`spec: ${join(out, outputs[0].file)}${outputs.length > 1 ? ` and ${outputs.length - 1} module files` : ''}`)
  } else if (command === 'check') {
    const stale = staleOutputs(out, outputsFor(config, model))
    if (stale.length) {
      console.error(`${out} is out of date with the code (${stale.join(', ')}). Run: code-atlas build`)
      process.exit(1)
    }
    console.log(`${out} matches the code (${model.sourceDigest})`)
  } else if (command === 'impact') {
    console.log(impactText(model, positional[0]))
  } else if (command === 'focus') {
    console.log(focusText(model, positional[0]))
  } else if (command === 'diff') {
    const ref = positional[0] ?? 'HEAD'
    const result = diffSpecs(specAt(config, ref), buildSpec(model), config.findings.accepted)
    console.log(options.json === 'yes' ? JSON.stringify(result, null, 1) : diffText(result, ref))
    if (options.strict === 'yes' && result.findings.added.some((finding) => !finding.accepted)) process.exit(1)
  } else if (command === 'docs') {
    console.log(docsText(model, Number(options.limit ?? 30)))
  } else if (command === 'findings') {
    console.log(summaryText(model))
  } else if (command === 'serve') {
    const outputs = outputsFor(config, model)
    if (!existsSync(join(out, outputs[0].file))) writeOutputs(out, outputs)
    serve({ root, specDirectory: out, editor: options.editor ?? 'vscode', port: options.port ?? 0, open: options.open !== 'no' })
  } else {
    console.log(HELP)
    process.exit(1)
  }
}
