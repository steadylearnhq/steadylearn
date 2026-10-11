---
name: linear-cli
description: Work with Linear from the terminal through schpet's `linear` CLI (github.com/schpet/linear-cli) — find, read, create and update issues, comment (with inline screenshots), start work on an issue as a git branch, link PRs, relate issues, and read projects, cycles, milestones, labels and documents. Use whenever a task touches Linear or an issue key like ENG-123, e.g. "what's on my plate", "open an issue for this bug", "move ENG-8 to In Progress", "comment on the ticket", "start ENG-6", "link this PR to the issue".
allowed-tools: Bash(linear:*)
---

# Linear from the terminal with `linear`

`linear` (schpet/linear-cli, installed with Homebrew) talks to Linear's API
with a stored API key. Check it is there and signed in before anything else:

```bash
linear --version        # this skill was written against 2.6.0
linear auth whoami      # workspace + user; fails if not logged in
```

If it isn't logged in, ask the user to run `! linear auth login` (it prompts
for a personal API key from Linear → Settings → Security & access). Never
print or paste the key; `linear auth token` exists but don't call it.

## Configuration: `.linear.toml`

A repo can pin its workspace and default team in `.linear.toml` at its root
(`linear config` writes one interactively):

```toml
workspace = "theartemkovtun"
team_id = "ENG"
issue_sort = "priority"
```

Read it first: it says which team `--team` defaults to, so most commands need
no `--team`. Without it, pass `--team <KEY>` (list keys with `linear team list`)
or `--workspace <slug>` for another workspace.

## Rules for running it non-interactively

You can't answer prompts, so every command must be fully specified:

- `issue create` → always `--no-interactive` plus `--title`.
- `project create`, `initiative create`, `label create` go interactive when
  given no flags; give them flags.
- Deletes prompt for confirmation (`-y`/`--confirm`/`--force`, depending on
  the command). **Confirm with the user before deleting anything**, then pass
  the flag.
- Add `--no-pager` to `issue mine`, `issue query` and `issue view`.
- Prefer `--json` where offered when you need to read fields; table output
  is for showing the user.
- Before setting a state, check its exact name with `linear team states`
  (`--state` takes a state name like `"In Progress"` or a type like `started`).

## Finding issues

```bash
linear issue mine --no-pager                            # mine, unstarted (Todo) only
linear issue mine --all-states --no-pager               # mine, every state
linear issue mine -s started -s unstarted --no-pager    # repeat -s for several
linear issue query --search "cookie banner" --json      # full-text, all assignees
linear issue query --label Bug --state backlog --unassigned --no-pager
linear issue query --assignee <username> --cycle active --json
linear issue query --project "<name>" --updated-after 2026-09-01 --json
```

`issue mine` (alias `issue list`) only shows **your** issues; use
`issue query` for anyone else's, a whole team, project or search. State types
are `triage`, `backlog`, `unstarted`, `started`, `completed`, `canceled`.
`--limit` defaults to 50 (`0` = all).

## Reading an issue

```bash
linear issue view ENG-8 --no-pager            # description + comments
linear issue view ENG-8 --json --no-download  # structured; keep image URLs remote
linear issue title ENG-8
linear issue url ENG-8
linear issue comment list ENG-8 --json
linear issue relation list ENG-8
```

The issue id is optional for most `issue` subcommands: it's read from the
current git branch when the branch name contains the key (`linear issue id`
prints what it detects).

## Creating and updating issues

Write any multi-line Markdown to a file in the scratchpad and pass it with a
`-file` flag; inline `--description`/`--body` is only for one-liners (it
mangles newlines and quoting).

```bash
linear issue create --no-interactive \
  --title "Cookie banner: add Reject all" \
  --description-file "$SCRATCH/desc.md" \
  --label Feature --priority 2 --state Todo --assignee self
# also: --project, --milestone, --cycle active, --parent ENG-3, --estimate, --due-date, --start

linear issue update ENG-8 --state "In Progress"
linear issue update ENG-8 --assignee self          # or --unassign
linear issue update ENG-8 --add-label Bug          # keeps other labels
linear issue update ENG-8 --remove-label Bug
linear issue update ENG-8 --label Bug --label UI   # REPLACES the whole label set
linear issue update ENG-8 --title "..." --description-file "$SCRATCH/desc.md"
linear issue update ENG-8 --cycle next             # --clear-cycle to remove
```

Priority: `1` urgent, `2` high, `3` medium, `4` low. Labels must already
exist (`linear label list --all`). Close an issue by moving it to a
completed/canceled state (`--state Done`) rather than deleting it.

## Comments, screenshots and links

```bash
linear issue comment add ENG-8 --body-file "$SCRATCH/comment.md"
linear issue comment add ENG-8 --body "Fixed in #37" --attach ./after.png   # image renders inline
linear issue comment add ENG-8 --parent <commentId> --body "..."            # reply in a thread
linear issue comment update <commentId> --body-file "$SCRATCH/comment.md"

linear issue link ENG-8 https://github.com/<owner>/<repo>/pull/37 --title "PR #37"
linear issue attach ENG-8 ./trace.log      # sidebar attachment; images do NOT render inline
```

To show a screenshot, use `comment add --attach`, not `issue attach`.
Uploads are private to the workspace unless `--public` is given.

**Mentions** (`linear markdown` has the full reference): only a bare Linear
URL becomes a mention. `@name` and `[Name](url)` stay plain text and notify
nobody. Get a person's URL from `linear team members ENG --json` (the `url`
field), an issue's from `linear issue url ENG-123`. `+++ [Title]` … `+++`
makes a collapsible section.

## Relations

```bash
linear issue relation add ENG-8 blocked-by ENG-6
linear issue relation add ENG-8 blocks ENG-9
linear issue relation add ENG-8 related ENG-7
linear issue relation add ENG-8 duplicate ENG-5
linear issue relation delete ENG-8 related ENG-7
```

## Git workflow

```bash
linear issue start ENG-8                 # creates/switches to its branch, marks it started
linear issue start ENG-8 --from-ref main # branch from main instead of HEAD
linear issue start ENG-8 -b my-branch    # custom branch name
linear issue describe                    # "<title>" + "Fixes ENG-8" trailer for a commit/PR
linear issue describe --ref              # "References ENG-8" (doesn't close on merge)
```

Always give `issue start` an id: without one it opens an interactive picker.
It creates a branch (named like `eng-8-…`) and switches to it, so check
`git status` is clean first and tell the user which branch it made.

`linear issue pull-request` opens a GitHub PR prefilled from the issue. If the
repo has its own PR conventions (a PR template, a `gh pr create --body-file`
rule in CLAUDE.md/AGENTS.md), follow those instead and put the issue's
`Fixes ENG-8` trailer (from `issue describe`) or its URL in the body; Linear's
GitHub integration links the PR either way.

## Projects, cycles, milestones, labels, documents

```bash
linear project list --json                      # --all-teams, --status <name>
linear project view <id|slug|name>
linear cycle list                               # cycles of the default team
linear cycle view active                        # or a number, next, previous
linear milestone list --project "<name>"
linear label list --all --json
linear team members ENG --json
linear document list --project "<name>" --json
linear document view <id> --raw
linear document create --title "..." --content-file "$SCRATCH/doc.md" --issue ENG-8
linear project-update create <project> --body-file "$SCRATCH/update.md" --health onTrack
```

## Anything else: raw GraphQL

When no command covers it, `linear api` sends a GraphQL query with the stored
credentials (`linear schema` prints the schema):

```bash
linear api 'query($id: String!) { issue(id: $id) { title state { name } } }' --variable id=ENG-8
linear api 'query { issues(first: 50) { nodes { identifier title } pageInfo { hasNextPage endCursor } } }' --paginate
```

Use it for reads freely; for mutations, say what you're about to change first.

## When something fails

- Re-run with `LINEAR_DEBUG=1` for the full error.
- "not found" on a project/label/state usually means a different spelling;
  list them (`project list`, `label list --all`, `team states`) and retry
  with the exact name.
- `linear <command> --help` is accurate for the installed version; flags
  differ between releases, so check it when a flag here is rejected.
