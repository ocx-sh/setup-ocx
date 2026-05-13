# Update Docs

When changing project structure, dependencies, task workflows, or any of the install surfaces, keep `README.md`, `README_GITLAB.md`, and `CONTRIBUTING.md` in sync.

## README.md (GitHub repo + Marketplace audience)

The README documents the **GitHub Action public interface**, the standalone shell installers, and a developer quick-start. Update the relevant section when:

- **Inputs/Outputs table** — an input or output is added, removed, or renamed in `action.yml`
- **Usage examples** — a new GHA input needs a usage example, or an existing example becomes outdated
- **Standalone shell installers section** — `OCX_INSTALL_*` env knobs added/changed/removed, exit codes change, or stdout/stderr contract changes
- **Development quick-start** — a task is added/renamed/removed in `taskfile.yml`, or prerequisites change
- **Badges** — a workflow file is renamed (badge URLs reference the workflow filename)

## README_GITLAB.md (GitLab Catalog audience, mirrored as README.md)

This is what shows up on the GitLab Catalog component page. Update when:

- **Inputs / Outputs tables** — `gitlab/func.yml` changes
- **Usage example** — image tag pattern, registry path, or input shape changes
- **Corporate-mirror example** — env knobs change names or semantics
- **Air-gapped instructions** — registry/distribution flow changes

GitHub-Action-specific content does not belong here. Keep this README focused on GitLab.

## CONTRIBUTING.md

The CONTRIBUTING guide documents **how to develop** the project. Update when:

- **Prerequisites** — a new tool dependency is introduced (linter, formatter, runtime)
- **Project Layout table** — a file or top-level directory is added, removed, or renamed
- **Canonical install logic** — the rule that `gitlab/install.sh` mirrors `sh/install.sh` byte-for-byte
- **Building / Running tests** — the bundler, build command, output path, or test commands change
- **GitLab Function dev loop** — Dockerfile contents, env wiring, or local-test workflow changes
- **Release flow** — `release.yml` jobs, secrets, or one-time setup steps change
- **Commit Conventions** — tooling changes (e.g., adding cocogitto validation)

## CLAUDE.md

This is the architecture overview the AI assistant relies on. Update when:

- A new install surface is added (e.g., a Bitbucket Pipe)
- The stdout/stderr contract or exit codes change
- The release flow gains or loses a step (e.g., a new artifact destination)

Always reflect changes in the `Architecture` and `Releases` tables.

## .claude/rules/installers.md

Installer-specific rules: env-knob naming, stdout/stderr discipline, exit-code stability, Bazelisk parity. Update when adding a new env knob or changing exit-code semantics.
