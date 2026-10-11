---
name: branch-naming
description: How to name a git branch — a type prefix (feature/, fix/, chore/, refactor/) followed by the ticket id (eng-12, cro-7) or, with no ticket, a 3-4 word kebab-case description. Use whenever you create, rename or suggest a branch, including when starting work on a Linear issue.
---

# Branch naming

Every branch is `<type>/<name>`, all lowercase.

## Type

Pick the one that fits the change:

- `feature/` — new behaviour a user or caller can see
- `fix/` — a bug fix
- `chore/` — tooling, CI, dependencies, docs, config; nothing the product does differently
- `refactor/` — restructuring code without changing what it does

## Name

- **With a ticket**: the ticket's id, lowercased, and nothing else:
  `feature/eng-12`, `fix/cro-7`.
- **Without a ticket**: a short description of 3-4 words, joined with `-`:
  `chore/bump-go-version`, `fix/cookie-sheet-overflow`.

## Rules

- Use this name even when a tool proposes its own. Linear's suggested branch
  name (e.g. `theartemkovtun/eng-12-seed-placeholder-stages`) is not used.
- No user prefixes, no slashes beyond the one after the type, no underscores
  or capitals.
- If you're unsure whether a task has a ticket, check Linear or ask before
  falling back to a description.
