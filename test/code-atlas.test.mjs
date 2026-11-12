import assert from 'node:assert/strict'
import { join } from 'node:path'
import { test } from 'node:test'
import { analyze, buildSpec, detectConfig, loadConfig, outputsOf, serialize } from '../src/index.mjs'

const FIXTURES = join(import.meta.dirname, 'fixtures')
const specOf = (name, overrides = {}) => buildSpec(analyze({ ...loadConfig(join(FIXTURES, name)), ...overrides }))
const game = specOf('game')
const service = specOf('service')
const system = (name) => game.systems.find((item) => item.name === name)
const unit = (spec, name) => spec.units.find((item) => item.name === name)
const values = (list) => list.map((item) => item.value)

test('reads the frame order from the pipeline array', () => {
  assert.deepEqual(game.frame, ['moveSystem', 'freezeSystem', 'drawSystem'])
  assert.deepEqual(game.systems.map((item) => item.position), [1, 2, 3])
})

test('records field reads and writes of a system', () => {
  assert.ok(values(system('moveSystem').writes).includes('Position.x'))
  assert.ok(values(system('moveSystem').reads).includes('Velocity.x'))
  assert.deepEqual(system('moveSystem').queries[0].terms, ['Position', 'Velocity', 'Not(Frozen)'])
})

test('links the system that adds a tag to the systems that query it', () => {
  assert.ok(game.edges.some((edge) => edge.from === 'freezeSystem' && edge.to === 'drawSystem' && edge.kind === 'tag' && !edge.nextFrame))
})

test('reports a reader that runs before the writer as one frame late', () => {
  assert.ok(game.findings.some((finding) => finding.kind === 'next-frame' && finding.system === 'moveSystem'))
})

test('keeps doc comments and links tests to the symbols they use', () => {
  assert.equal(unit(game, 'moveSystem').doc, 'Moves every entity by its velocity once per frame.')
  assert.ok(game.tests.some((item) => item.title === 'moves an entity by its velocity' && item.symbols.includes(unit(game, 'moveSystem').id)))
})

test('writes the same bytes for the same code', () => {
  assert.equal(serialize(specOf('game')), serialize(game))
})

test('turns classes and methods into symbols with decorators', () => {
  assert.deepEqual(unit(service, 'UsersController').decorators, ['Controller'])
  assert.deepEqual(unit(service, 'UsersController.one').decorators, ['Get'])
  assert.equal(unit(service, 'UsersService.find').owner, unit(service, 'UsersService').id)
})

test('follows calls through dependency injection and private methods', () => {
  assert.ok(unit(service, 'UsersService.find').callers.some((caller) => caller.name === 'UsersController.one'))
  assert.ok(unit(service, 'UsersService.normalize').callers.some((caller) => caller.name === 'UsersService.find'))
})

test('finds tests next to the code, including it.each', () => {
  assert.ok(service.tests.some((item) => item.title === 'finds user %s'))
})

test('splits the map into modules with an index and the calls between them', () => {
  const outputs = outputsOf({ ...loadConfig(join(FIXTURES, 'game')), split: ['src/game/ecs/systems/move', 'src/game/ecs/systems/view'] }, game)
  const index = JSON.parse(outputs[0].text)
  assert.equal(outputs[0].file, 'index.json')
  assert.deepEqual(index.modules.map((module) => module.path).sort(), ['.', 'src/game/ecs/systems/move', 'src/game/ecs/systems/view'])
  const units = outputs.slice(1).flatMap((output) => JSON.parse(output.text).units)
  assert.equal(units.length, game.units.length)
})

test('init detects the ECS layout and the frame', () => {
  const { config } = detectConfig(join(FIXTURES, 'game'))
  assert.equal(config.layers.systems, 'src/game/ecs/systems')
  assert.equal(config.pipeline.file, 'src/game/ecs/systems/index.ts')
  assert.deepEqual(config.pipeline.entries, ['pipeline'])
})
