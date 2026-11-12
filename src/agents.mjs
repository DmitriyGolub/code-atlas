import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const SKILL_SOURCE = join(import.meta.dirname, '..', 'skills', 'code-atlas', 'SKILL.md')
const SKILL_TARGET = join('.claude', 'skills', 'code-atlas', 'SKILL.md')
const INSTRUCTION_FILES = ['CLAUDE.md', 'AGENTS.md']
const FALLBACK_FILE = 'AGENTS.md'
const MARKER = '## Code atlas'
const SECTION = `${MARKER}

The map of this codebase is \`docs/code-atlas/code-atlas.json\`, built from the code by code-atlas. Read it instead of searching files.
- Before changing a symbol: \`npx code-atlas impact <symbol>\`, name the affected systems and tests in the plan.
- After the change: \`npx code-atlas diff\`, report new links and findings.
- To improve the docs: \`npx code-atlas docs\` lists symbols without a /** */ comment, most used first.
- No pre-commit hook rebuilds the map yet? Offer once to add one. A large map can be split per package with "split": "auto", mention it once.
- Details are in the code-atlas skill.
`

export function installAgentRules(root) {
  const done = []
  const skill = join(root, SKILL_TARGET)
  if (!existsSync(skill)) {
    mkdirSync(dirname(skill), { recursive: true })
    copyFileSync(SKILL_SOURCE, skill)
    done.push(`added the skill ${SKILL_TARGET}`)
  }
  const present = INSTRUCTION_FILES.filter((name) => existsSync(join(root, name)))
  for (const name of present.length ? present : [FALLBACK_FILE]) {
    const file = join(root, name)
    const text = existsSync(file) ? readFileSync(file, 'utf8') : ''
    if (text.includes(MARKER)) continue
    writeFileSync(file, `${text}${text && !text.endsWith('\n') ? '\n' : ''}${text ? '\n' : ''}${SECTION}`)
    done.push(`added "${MARKER}" to ${name}`)
  }
  return done
}
