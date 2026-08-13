# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project adheres to [Semantic Versioning](https://semver.org/).

## [0.2.0] - 2026-08-12

Two-scope state model: shared project history stays a committed, PR-reviewed
feature while personal data structurally never enters the project repo.

### Added
- **User scope** at `~/.anchor` (override with `ANCHOR_USER_DIR`) — the new
  default write target for memory and notepads. Private, follows you across
  projects, never touched by git. Can itself be a private git repo.
- `scope` parameter (`"user"` | `"project"`) on `memory_manager` add and
  `notepad_manager` save/get. Search and list merge both scopes, labeling
  each result with its scope; notepad `get` without a scope checks user
  first and falls back to project.
- Self-enforcing `.anchor/.gitignore`: generated on the first project-scope
  write (covers `state.json` and its tmp file), create-if-absent — your
  edits are never overwritten.
- Graceful startup outside a git repository: user-scope memory and notepads
  work from anywhere; project-scope tools return a clear per-call error
  instead of crashing the server.
- `~` expansion in `ANCHOR_USER_DIR` and `ANCHOR_STATE_DIR`.
- Privacy section in the README, including the upgrade step for a
  `state.json` committed under v0.1.

### Changed
- Memory and notepad writes default to user scope; pass `scope: "project"`
  to share via git. Plans, rules, and tasks remain project scope.
- `notepad_manager` list now returns `{ user: string[], project: string[] }`.
- `memory_manager` `limit` must be a positive integer (`limit: 0` previously
  returned everything).

### Fixed
- Path traversal: notepad topics and plan names/sections are validated
  before any filesystem path is built (they previously accepted `../`).
- Torn writes: notepads, rules, and plans now use atomic
  write-to-temp-then-rename with process-unique temp names (concurrent
  sessions previously raced on a shared temp file).
- A malformed line in `memory.jsonl` no longer breaks every search/list —
  entries are shape-validated and bad lines are skipped.
- Fresh clones with a committed `.anchor/` no longer fail on the first
  notepad save (state subdirectories are created idempotently).
- When project and user scope resolve to the same directory (e.g. `$HOME`
  is itself a git repo), entries are no longer double-listed.
- An empty user-scope notepad no longer silently falls through to the
  project version.

### Removed
- Dead `learningIndex` parameter on `promote_learning` (it was accepted and
  ignored).

## [0.1.0] - 2026-07-31

Initial release: 6 grouped MCP tools (task, plan, notepad, memory, rules,
promote_learning) over a per-worktree `.anchor/` directory — atomic
`state.json` writes, append-only JSONL memory, markdown plans/notepads/rules.
