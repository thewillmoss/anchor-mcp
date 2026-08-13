# v0.2 — Scopes and privacy

## Goal

Make anchor's committed-state selling point safe by construction. Today the README
says plans, notepads, rules, and memory are "designed to be committed" — but memory
and notepads are exactly where personal data lands (pasted keys, client names,
business numbers), and nothing routes that data away from a public repo. v0.2 splits
state into two scopes so shared history stays a committed feature while personal
data structurally never enters the project repo.

Design settled in conversation 2026-08-12. Sibling-repo pattern (`*-dot-anchor`)
was considered and rejected: GitHub wikis prove that convention-paired repos outside
the clone-and-PR path atrophy. The model is scopes, like git config system/global/local.

## Design

### Two scopes

| Store | Project scope (`<worktree>/.anchor/`) | User scope (`~/.anchor/`) |
|---|---|---|
| tasks / state.json | yes — worktree-specific, gitignored | never |
| plans/ | yes — committed, PR-reviewed | never |
| rules.md | yes — committed | never |
| memory.jsonl | opt-in (`scope: "project"`) | **default** |
| notepads/ | opt-in (`scope: "project"`) | **default** |

Rationale for defaults: plans and rules want PR review next to the code they
describe (the ops/codex pattern — tickets committed, briefs gitignored). Memory
and notepads follow the developer, carry the personal-data risk, and should reach
the project repo only by deliberate choice.

- User scope root: `~/.anchor/`, overridable via `ANCHOR_USER_DIR`.
- The user dir may itself be a git repo (developer's choice) — that recovers the
  "preserved personal history" property with no naming convention. Anchor never
  inits or touches git there.
- Existing `ANCHOR_STATE_DIR` semantics unchanged (project-scope root override).

### Reads and writes

- Writes take `scope?: "user" | "project"`; defaults per table above.
- `memory search` / `memory list`: merge both scopes, each entry annotated with
  its scope in the result. `add` writes to one scope only.
- `notepad get` without explicit scope: user scope first, fall through to project.
  `notepad list`: union, labeled. `save` defaults to user.
- `task_manager`, `plan_manager`, `rules_manager`, `promote_learning`: project
  scope only, no new params.

### Self-enforcing gitignore

`ensureAnchorDir()` (project scope only) writes `.anchor/.gitignore` if absent:

```
# machine-specific — do not commit
state.json
state.json.tmp
```

Never overwrite an existing file (users may extend it, e.g. add `memory.jsonl`).
No gitignore generated in the user dir. This makes the README's existing advice
("state.json is machine-specific and should be gitignored") self-enforcing in
every repo anchor touches, without contradicting the committed-state design.

## Work items

### 1. `src/worktree.ts` — user root resolution
- [x] `resolveUserAnchorDir(): string` — `ANCHOR_USER_DIR` (resolved) else
      `join(homedir(), ".anchor")`.
- [x] Graceful startup outside a git repo: `detectWorktreeRoot()` currently throws
      at module load (`src/index.ts:23`), so a globally-configured anchor shows as
      a failed MCP server in every non-git session. With user scope this is wrong,
      not just noisy — user-scope memory/notepads should work anywhere. Detect
      lazily or catch at startup: project-scope tools return a clear "not inside
      a git repository" error per call; user-scope tools work normally.

### 2. `src/store.ts` — store plumbing
- [x] `AnchorStore` constructor accepts an options bag `{ anchorDir?: string }`
      so the user store can point at `~/.anchor` directly (today the store always
      joins `rootDir + ".anchor"`, which would yield `~/.anchor/.anchor`).
- [x] `ensureAnchorDir()` writes the `.gitignore` above when creating the dir
      (and when the dir exists but has no `.gitignore` — idempotent, never clobbers).
      Gate it: only for the project store (pass a flag or check via options).
- [x] Remove the unused `resolve` import if still unused after changes.

### 3. `src/index.ts` — composition
- [x] Instantiate `projectStore` (as today) and `userStore`
      (`new AnchorStore("", { anchorDir: resolveUserAnchorDir() })`).
- [x] Pass both to memory and notepad registrars; project-only tools unchanged.

### 4. `src/tools/memory.ts`
- [x] `scope` param on `add` (enum `user | project`, default `user`), describe the
      privacy rationale in the param description so agents pick correctly.
- [x] `search`/`list` merge both stores; each returned entry gains `scope` field.
      Keep `limit` applied after merge, newest-last as today.

### 5. `src/tools/notepad.ts`
- [x] `scope` param on `save` (default `user`) and `get` (optional; omitted =
      user-then-project fall-through). `list` returns
      `{ user: string[], project: string[] }` or labeled flat list — pick one,
      document it in the tool description.

### 6. `src/tools/promote.ts` + `src/store.ts`
- [x] Drop the `learningIndex` param entirely (it is accepted and ignored today —
      `store.ts` `promoteLearning`). Honest surface over dead surface; revisit if
      a real need appears. Note in CHANGELOG since it's a (trivial) schema change.

### 7. `src/types.ts` / `src/constants.ts`
- [x] `Scope` type, scope fields on the manager input interfaces, user-dir constant.

### 8. Tests (`tests/`)
- [x] `.gitignore` generated on first project write; not clobbered when present;
      not created in user dir.
- [x] Scope routing: memory add default→user file, explicit project→project file;
      search merges and labels both; limit respected post-merge.
- [x] Notepad fall-through: get without scope finds project note when no user note.
- [x] `ANCHOR_USER_DIR` override respected.
- [x] User dir not created until first user-scope write (no `~/.anchor` litter
      from read-only sessions).
- [x] Existing 25 tests stay green unmodified (backward compat: a pre-v0.2
      project `.anchor/` keeps working with zero migration).

### 9. README
- [x] Rewrite "State directory" section: two-scope table + both trees.
- [x] Replace "Plans, notepads, rules, and memory are designed to be committed"
      with: plans + rules committed; memory + notepads default to user scope,
      opt into project scope per write.
- [x] New short "Privacy" section: what lands where, the generated `.gitignore`,
      one paragraph of incident response (a pushed secret is compromised the
      moment it lands — rotate first; force-push + GitHub Support GC is cleanup,
      not an undo).
- [x] Mention `ANCHOR_USER_DIR`, and that `~/.anchor` can be a private git repo.

### 10. Deployment (makes "in daily use" true)
- [x] Project-scope `.mcp.json` in this repo: done 2026-08-12. Global rollout
      deliberately deferred until the graceful-startup fix (item 1) lands —
      a global anchor currently crash-loops in every non-git session.
- [ ] Then add anchor to `~/.claude.json` (global mcpServers), `~/.codex/config.toml`,
      `~/.config/opencode/opencode.json` — all via `npx -y @thewillmoss/anchor-mcp`.
- [ ] Dogfood: this repo (this plan file is the first committed artifact) and one
      rackify worktree.

### 11. Release
- [ ] CHANGELOG entry, bump to 0.2.0, `npm publish`, tag `v0.2.0`.

## Acceptance

- `npm test` green including new scope/gitignore tests; `npm run typecheck` clean.
- MCP inspector smoke: memory add (both scopes), search shows labeled merge,
  notepad fall-through works, fresh repo gets `.anchor/.gitignore` on first write.
- README contains no claim the code doesn't enforce.

## Explicitly deferred to v0.3+ (do not pull in)

From the ship review battery (2026-08-12, Claude + Codex adversarial):
- Cross-project user-scope exposure: any repo's session can read all user-scope
  memory/notepads — deliberate in v0.2 (it's the "follows you" feature), but
  prompt-injection read-gating and/or per-project namespacing under `~/.anchor`
  needs a design pass.
- Notepad topic collisions across projects (last-writer-wins in user scope) —
  same namespacing design pass.
- `isError: true` on tool error results (currently error text in a success shape).
- fsync durability for atomic writes; file locking / compare-and-swap for
  concurrent sessions (lost-update window remains).
- Write-side handling when project and user scope resolve to the same dir
  ($HOME as a git repo) — v0.2 only suppresses the read-side double-listing.
- Size caps on memory content/tags; tail-read or mtime cache for large
  memory.jsonl (unbounded full-file parse per search today).
- Symlink guard covers leaf files only — an intermediate directory
  (`.anchor/plans/<name>` itself) committed as a symlink is not checked.

- Ticket-grade task schema (`blocked_by`, `touches`, `end_proof`, claim-with-
  conflict-refusal) and the markdown-frontmatter task-store decision.
- Learnings schema upgrade (`signature`, `appliesTo`, `graduated`, `hits`) +
  `get_applicable` injection API.
- Run-record tool (sha-stamped gates).
- deepagents-runner as first external consumer.

Standing constraint (mirrors rackify NOT-DOING.md): anchor is a state store.
It never runs gates, merges, dispatches, or holds any authority-bearing action.
