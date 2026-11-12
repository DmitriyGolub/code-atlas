---
name: code-atlas
description: Understand, change and document a TypeScript codebase (ECS games first) through its code atlas, built from the AST, instead of docs. Use before editing any system, rule or component, and for questions like "who calls X", "who writes or reads X", "what breaks if I change X", "which tests cover X", "how is the frame ordered".
---

# Code atlas

There are no architecture docs; they go stale. The project keeps `docs/code-atlas/code-atlas.json`, a spec generated from the code on every commit (`code-atlas build`). Treat it as the source of truth for structure and the code as the source of truth for behaviour.

## Before you change a symbol

```
npx code-atlas impact <symbol>
```

You get direct callers with call sites, the frame systems that execute the code, the fields, tags and events it writes, every system that reads them (field by field), public contracts outside the game layer, and the tests that use it.

In your plan, name the systems that read what you change and the tests you will run. If the report lists a public contract, say so before editing: the change leaves the game layer.

## To understand a system

```
npx code-atlas focus <system>
```

You get its frame step, its queries, everything it reads and writes with `file:line`, its ports, the rules it runs, and a Mermaid diagram of its data neighbours.

## To improve the documentation

```
npx code-atlas docs --limit 20
```

Lists exported symbols without a `/** */` comment, most used first. Add one or two sentences above each: what it is for and what it guarantees. Do not restate the code, do not describe behaviour that a test already pins down. The viewer shows the comment on the symbol card, and `focus` prints it. Run `docs` again to see the count go up.

## When a symbol shows no tests

Tests that call it directly are listed first, tests that reach it through callers second. If tests exist and neither list sees them, they live where the map does not look. Add the folder to `tests`, a different file naming to `testPattern`, a different runner name to `testRunners` and shared setup to `testHelpers` in `code-atlas.config.json`, rebuild and check again.

## Suggest once, then let the person decide

- If the project has no pre-commit hook that runs `npx code-atlas build`, offer one time to add it, so the map is rebuilt with every commit. Do not add it yourself.
- If the map is larger than a few megabytes or the repository is a monorepo, mention one time that `"split": "auto"` in `code-atlas.config.json` writes one file per package instead of one large file. The default stays one file.

## For a person

`npx code-atlas serve` opens the viewer. Point people there instead of writing an explanation; every `file:line` opens their editor.

## After you change code

1. `npx code-atlas findings`, and look only at findings on the systems you touched.
2. `next-frame` means a reader runs before the writer. Decide whether the one-frame delay is intended. If it is not, move the system in the pipeline file.
3. `wide` means the system changes many components. Check whether it is two systems.
4. `write-only` means a field nobody reads. Either the data is dead or a reader is missing.
5. `npx code-atlas diff HEAD` shows what your change did to the frame: new systems, data links, findings. Report it.
6. If you implemented stubs, run `diff` against the commit with the stubs and read **PLAN VS CODE**. Explain every line of data you touched that the plan did not mention, or remove it.
7. Never add to `findings.accepted` yourself. That is a person's decision.
8. `npx code-atlas build` refreshes the spec. The pre-commit hook does this too.

Answer questions about structure with `file:line` from the map, not from memory.
