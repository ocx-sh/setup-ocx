# Update Docs

When changing project structure, dependencies, task workflows, or the action interface, keep README.md and CONTRIBUTING.md in sync.

## README.md

The README documents the **public interface** of the action and a developer quick-start. Update the relevant section when:

- **Inputs/Outputs table** — an input or output is added, removed, or renamed in `action.yml`
- **Usage examples** — a new input needs a usage example, or an existing example becomes outdated
- **Development quick-start** — a task is added, renamed, or removed in `taskfile.yml`, or prerequisites change
- **Badges** — a workflow file is renamed (badge URLs reference the workflow filename)

## CONTRIBUTING.md

The CONTRIBUTING guide documents **how to develop** the project. Update the relevant section when:

- **Prerequisites** — a new tool dependency is introduced (e.g., a linter, formatter, or runtime)
- **Project Layout table** — a source file is added, removed, or renamed under `src/`, or a new top-level directory is introduced (e.g., a new `scripts/` dir)
- **Building section** — the bundler, build command, or output path changes (e.g., switching from ncc to esbuild)
- **Running Tests section** — test commands or task names change in `taskfile.yml`
- **Commit Conventions** — convention tooling changes (e.g., adding cocogitto validation)
