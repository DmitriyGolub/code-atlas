import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { INDEX_FILE, MODULES_FOLDER, SINGLE_FILE } from './split.mjs'

const writtenBefore = (out) => [
  ...[SINGLE_FILE, INDEX_FILE].filter((file) => existsSync(join(out, file))),
  ...(existsSync(join(out, MODULES_FOLDER)) ? readdirSync(join(out, MODULES_FOLDER)).filter((name) => name.endsWith('.json')).map((name) => `${MODULES_FOLDER}/${name}`) : []),
]

export function writeOutputs(out, outputs) {
  const wanted = new Set(outputs.map((output) => output.file))
  for (const file of writtenBefore(out)) if (!wanted.has(file)) rmSync(join(out, file))
  for (const { file, text } of outputs) {
    mkdirSync(dirname(join(out, file)), { recursive: true })
    if (!existsSync(join(out, file)) || readFileSync(join(out, file), 'utf8') !== text) writeFileSync(join(out, file), text)
  }
}

export function staleOutputs(out, outputs) {
  const wanted = new Set(outputs.map((output) => output.file))
  const changed = outputs.filter(({ file, text }) => !existsSync(join(out, file)) || readFileSync(join(out, file), 'utf8') !== text).map((output) => output.file)
  return [...changed, ...writtenBefore(out).filter((file) => !wanted.has(file))]
}
