---
name: pull-requests
description: How to open and describe a pull request in steadylearn — the title (`ENG-12: ...` when there is a ticket), a short description filled in from `pr-template.md` with at most 3 bullets per section, and light-mode, normal-resolution screenshots for visual changes. Use whenever you open a PR, write or rewrite a PR title or description, or add screenshots to one.
---

# Pull requests

## Title

- **With a ticket**: the ticket's key in capitals, a colon, then the summary:
  `ENG-21: Add a skill for opening pull requests`.
- **Without a ticket**: the summary alone.
- The summary is a short imperative sentence in sentence case, like a commit
  subject, with no trailing full stop. With several tickets, the title takes
  the main one and the **Ticket** section lists them all.

## Description

Fill in `pr-template.md` and drop its guidance comments. Pass it with
`gh pr create --body-file <file>`, writing the file in the scratchpad, not
the repo.

- **Up to 3 bullets per section**, each one line or two. No sub-bullets and no
  prose paragraphs.
- **Only what a reviewer needs**: why the change exists, the approach and
  anything surprising, what was checked, and what could break. Leave out file
  lists, step-by-step test logs and anything the diff already makes obvious.
- **Sections**: Why, Ticket (a link per ticket, from `linear issue url ENG-XX`;
  dropped when there is none), What, Risks (say so if there is no real risk),
  and Visual changes only when the PR changes what the app shows.

## Visual changes

When the PR changes what the app shows and it can be run, add screenshots as
evidence:

- **Light mode only.** Light is the app's default; if the browser has a stored
  theme, set `localStorage['sl-theme'] = 'light'` and reload before capturing.
- **Normal resolution**: the visible viewport (not a full-page capture) at a
  device pixel ratio of 1, e.g. 1440×900 for desktop, plus 390px wide only if
  the change affects phones. A retina (2x) capture gets scaled down to the
  viewport width first: `sips --resampleWidth 1440 shot.png`.
- One table row per changed screen, before and after where there is a before,
  with a short caption. Save shots in the scratchpad and attach them with `gh
  --attach` (the `github-attachments` skill).

If the app can't be run to capture them, keep the section with one bullet
saying why.

## Opening it

- Name the branch with the `branch-naming` skill. The PR may change at most one
  of `.github/`, `api/` and `app/`; split it otherwise.
- Run the checks for the area it changes (`AGENTS.md` lists them) before
  pushing, and say in **What** that they passed.
- Once the PR is open, link it to its ticket and move the ticket to In Review
  (the `linear-issue-flow` skill).
