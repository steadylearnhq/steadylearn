---
name: github-attachments
description: Upload local images or videos (screenshots, screen recordings, before/after shots) to a GitHub pull request, issue or comment with the GitHub CLI's `--attach` flag. Use whenever a screenshot or recording should appear in a PR description, a PR or issue comment, or a new issue, e.g. "add screenshots to the PR", "attach the before/after", "post this image on the issue".
---

# Attaching images and videos with `gh`

`gh` uploads a local image or video to GitHub and puts its URL into the body,
so no image is ever committed to the repo or hosted elsewhere. It needs push
access to the repository and a recent gh: if `gh pr comment --help` doesn't
list `--attach`, upgrade gh first.

## Commands that take `--attach`

| Command | Where the file goes |
| --- | --- |
| `gh pr create`, `gh issue create` | the new body |
| `gh pr edit`, `gh issue edit` | appended to the existing body (or into the new one given with `--body`/`--body-file`) |
| `gh pr comment`, `gh issue comment` | the comment |

## Syntax

```bash
# One image; without alt text, the file name is used
gh pr comment 42 --attach ./after.png

# Alt text follows the path after "#"; quote the whole argument
gh pr comment 42 --attach './after.png#Catalog at 375px wide'

# Several files: repeat the flag (up to 50 per command, each file once)
gh pr edit 42 --attach './before.png#Before' --attach './after.png#After'
```

- Images and videos only (e.g. PNG, JPG, GIF, MP4, MOV), not PDFs, zips or logs.
- A video renders as a player and can't be given alt text.

## Placing images inside the body

Attached files that the body doesn't reference are appended to the end of the
body in flag order. To put an image in a specific spot, reference it in the
Markdown **by the exact path string you pass to `--attach`**. `gh` then
rewrites that reference to the uploaded URL instead of appending the file
again. This works for `--body`, `--body-file`, stdin and the editor.

```markdown
## What
- Catalog rows stack below 640px

| Before | After |
| --- | --- |
| ![Before](./shots/before.png) | ![After](./shots/after.png) |
```

```bash
gh pr create --title "..." --body-file pr-body.md \
  --attach ./shots/before.png --attach ./shots/after.png
```

Alt text written in the body wins over the `#alt` in the flag. A video must
be an empty image reference on its own line/paragraph: `![](./shots/demo.mp4)`.

## Working with a repo

- Save screenshots in the session's scratchpad directory (or another path
  outside the repo), never in the working tree: they must not get committed.
- If the repo has a PR template or PR rules (`AGENTS.md`, `CLAUDE.md`,
  `.github/pull_request_template.md`, …), fill the body in from it and put the
  images in the section describing the change, e.g. a before/after table.
  Then pass the filled-in file with `--body-file` plus one `--attach` per image.
- For a PR that already exists, add screenshots with `gh pr edit <n> --attach …`
  (appends to the description) or `gh pr comment <n> --attach …`. Don't pass
  `--body` to `gh pr edit` unless you mean to replace the whole description.

## Failures

If some uploads fail, the PR/issue is still created or updated with the ones
that succeeded: the command exits non-zero but still prints the URL. Read the
error, then add the missing files with `gh pr edit <n> --attach …` rather than
creating the PR again.

Source: https://docs.github.com/en/github-cli/github-cli/attaching-files-with-github-cli
