---
name: linear-issue-flow
description: How an agent moves a Linear issue through its workflow while working on it — In Progress when work starts, In Review (with the PR linked) once the pull request is open, and never Done, which the user sets. Use whenever you start, pick up or continue work on a Linear issue (a key like ENG-123, a Linear URL, or "the next ticket in the project"), and whenever you open a pull request for one.
allowed-tools: Bash(linear:*)
---

# Moving a Linear issue while you work on it

An issue's status tells the user where the work is. Keep it accurate at two
moments, and leave every other status change to the user.

| When | Move the issue to | Also |
| -- | -- | -- |
| You start working on it | **In Progress** | assign it to the user if it has no assignee |
| Its pull request is open and ready for review | **In Review** | link the PR to the issue |
| The PR is merged | nothing: **the user moves it to Done** | |

The commands below use schpet's `linear` CLI (the `linear-cli` skill has the
full reference). If it isn't installed or signed in (`linear auth whoami`
fails), do the same through the Linear MCP tools (`save_issue` with `state`,
`assignee` and `links`).

## 1. Starting work: In Progress

"Starting" means your first change for the issue: creating its branch, or
the first edit if you're already on it. Reading an issue or planning it is
not starting.

```bash
linear issue view ENG-11 --json --no-download   # check its state and assignee first
linear issue update ENG-11 --state "In Progress"
linear issue update ENG-11 --assignee self      # only if it has no assignee
```

- Move it only forward: from Backlog, Todo or Triage. If it's already In
  Progress or In Review, leave it.
- Work on the issue's own branch, the `branchName` Linear gives it
  (`linear issue view ENG-11 --json`), branched from an up-to-date main.
  `linear issue start ENG-11 --from-ref main` does both the branch and the
  status in one go; check `git status` is clean before it switches branches.
- Move only the issue you're actually starting, not the rest of its project.

## 2. Pull request open: In Review

Once `gh pr create` has succeeded and the PR is ready for review (not a
draft):

```bash
linear issue link ENG-11 https://github.com/<owner>/<repo>/pull/41 --title "PR #41"
linear issue update ENG-11 --state "In Review"
```

- Put the issue in the PR too: its link, following the repo's PR template if
  it has one, or `References ENG-11` (`linear issue describe --ref`). Avoid
  `Fixes ENG-11`: with Linear's GitHub integration, merging closes the issue.
- A draft PR keeps the issue In Progress. Move it to In Review when the PR
  is marked ready.
- One PR for several issues: link it to each and move each one.
- Pushing more commits to an open PR, or answering review comments, doesn't
  change the status.

## 3. Never set Done (or Canceled)

The user moves issues to Done themselves, after they've merged and checked
the work. Don't set Done, Canceled or Duplicate unless the user asks you to
in that conversation.

## When a status is missing

Status names are per team. Check them with `linear team states <TEAM>`
before the first move. If the team has no "In Review" (or "In Progress"),
don't create one and don't substitute another status: tell the user which
status is missing and leave the issue where it is.

## Say what you changed

When you move an issue, say so in one line in your reply, e.g.
"ENG-11 → In Review, PR #41 linked."
