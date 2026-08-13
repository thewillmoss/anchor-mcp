# anchor-mcp

A portable agent working state server. Any AI coding agent drops anchor here.

Anchor is an [MCP server](https://modelcontextprotocol.io) that manages
persistent working state for AI coding agents — tasks, plans, scratch notes,
learnings, and project rules. It works with Claude Code, OpenCode, Codex CLI,
Cursor, Windsurf, or any MCP-compatible agent.

![Anchor: one agent writes the task, a separate process reads it back](demo/anchor.gif)

> **Status: early, and in daily use.** I run Anchor across Claude Code, Codex CLI,
> and OpenCode every day; it is the reason it exists. The surface is small and
> stable — 6 grouped tools, two state scopes, atomic writes, 68 tests. Expect the tool schemas to
> stay put and the internals to keep moving. Issues and reports welcome.

## Why?

Every AI coding tool has its own proprietary state directory (`.claude/`,
`.codex/`, `.opencode/`). None of them share state. Anchor gives every agent
a shared home base — the same active task, the same plans, the same memory —
regardless of which tool you're using.

## What it stores

Per git worktree, Anchor manages:

- **Active task** — what you're working on right now
- **Plans** — execution blueprints with linked issues and learnings
- **Notepads** — freeform scratch notes by topic
- **Memory** — tagged learnings, decisions, and patterns
- **Rules** — project-specific agent instructions

## Quick start

### Install

```bash
npm install -g @thewillmoss/anchor-mcp
```

Or run it without installing — every config below works with `npx` too:

```bash
npx -y @thewillmoss/anchor-mcp
```

> The unscoped `anchor-mcp` name on npm belongs to an unrelated Solana project.
> This package is scoped; the binary it installs is still called `anchor-mcp`.

### Configure (Claude Code)

Add to `.claude/.mcp.json`:

```json
{
  "mcpServers": {
    "anchor": {
      "command": "npx",
      "args": ["-y", "@thewillmoss/anchor-mcp"]
    }
  }
}
```

### Configure (OpenCode)

Add to `~/.config/opencode/opencode.json`:

```json
{
  "mcp": {
    "anchor": {
      "type": "local",
      "command": ["npx", "-y", "@thewillmoss/anchor-mcp"],
      "enabled": true,
      "environment": {}
    }
  }
}
```

### Configure (Codex CLI)

Add to `.codex/config.toml`:

```toml
[mcp_servers.anchor]
command = "npx"
args = ["-y", "@thewillmoss/anchor-mcp"]
```

### Configure (Cursor / Windsurf)

Add to your MCP server settings:

```json
{
  "anchor": {
    "command": "npx",
    "args": ["-y", "@thewillmoss/anchor-mcp"]
  }
}
```

## Tools

Anchor provides 6 grouped tools. Each tool accepts an `action` parameter:

| Tool | Actions | Description |
|------|---------|-------------|
| `task_manager` | `get_active`, `set_active`, `complete`, `list` | Manage the active task and task list |
| `plan_manager` | `get`, `save`, `list` | Manage execution plans with issues and learnings |
| `notepad_manager` | `get`, `save`, `list` | Manage freeform scratch notes by topic |
| `memory_manager` | `add`, `search`, `list` | Store and retrieve learnings, decisions, patterns |
| `rules_manager` | `get`, `save` | Manage project-specific agent instructions |
| `promote_learning` | _(single action)_ | Promote plan learnings into project rules |

`memory_manager` and `notepad_manager` also accept a `scope` param
(`"user"` or `"project"`) — see [State directory](#state-directory) for the
defaults and fall-through rules.

### Usage examples

**Set an active task:**
```
task_manager(action="set_active", description="Implement user authentication")
```

**Save a plan:**
```
plan_manager(action="save", name="auth-flow", content="# Auth Flow Plan\n\n1. Add login endpoint\n2. Add JWT middleware")
```

**Add a memory (defaults to private, user scope):**
```
memory_manager(action="add", content="Always use httpOnly cookies for JWT", tags=["auth", "security"])
```

**Add a memory the whole team should see (opt into project scope):**
```
memory_manager(action="add", content="We use httpOnly cookies for JWT, decided in RFC-12", scope="project")
```

**Search memories (merges both scopes, each result labeled):**
```
memory_manager(action="search", query="authentication")
```

## State directory

Anchor splits state into two scopes, the same way git splits config into
system/global/local — shared history stays a committed, PR-reviewed feature,
while personal data structurally never enters the project repo.

| Store | Project scope (`<worktree>/.anchor/`) | User scope (`~/.anchor/`) |
|---|---|---|
| tasks / `state.json` | yes — worktree-specific, gitignored | never |
| `plans/` | yes — committed, PR-reviewed | never |
| `rules.md` | yes — committed | never |
| `memory.jsonl` | opt-in (`scope: "project"`) | **default** |
| `notepads/` | opt-in (`scope: "project"`) | **default** |

Tasks, plans, and rules stay project-only — they want PR review next to the
code they describe. Memory and notepads follow the developer and carry the
personal-data risk (pasted keys, client names, business numbers), so they
default to user scope and reach the project repo only by deliberate choice
(`scope: "project"` on `memory_manager` add, or `notepad_manager` save).
`memory_manager search`/`list` and `notepad_manager get`/`list` always check
both scopes — search/list merge and label each result, `get` checks user
first and falls back to project.

**Project scope** — `.anchor/` at your git worktree root:

```
.anchor/
├── .gitignore               # generated on first write, never overwritten
├── state.json                # active task + task list (gitignored)
├── plans/
│   └── {plan-name}/
│       ├── plan.md
│       ├── issues.md
│       └── learnings.md
├── notepads/                 # only if scope: "project" was used
│   └── {topic}.md
├── memory.jsonl               # only if scope: "project" was used
└── rules.md
```

**User scope** — `~/.anchor/` by default, or `ANCHOR_USER_DIR` if set. Never
created until the first user-scope write, and never touched by git — it can
itself be a private git repo if you want history without a naming convention
tying it to any one project:

```
~/.anchor/
├── notepads/
│   └── {topic}.md
└── memory.jsonl
```

Outside a git repository, project-scope tools (`task_manager`, `plan_manager`,
`rules_manager`, `promote_learning`, and project-scoped memory/notepad calls)
return a clear error instead of crashing the server — user-scope memory and
notepads keep working anywhere.

## Privacy

- **Where things land**: user scope (`~/.anchor`) is the default for memory
  and notepads and is never read by git in your project. Project scope
  (`<worktree>/.anchor`) is committed and PR-reviewed — use it deliberately,
  via `scope: "project"`, only for things meant to be shared.
- **The generated `.gitignore`**: the first write to a project's `.anchor/`
  writes `.anchor/.gitignore` (ignoring `state.json` and `state.json.tmp`) if
  one isn't already there. It's create-if-absent — extend it yourself (e.g.
  to also ignore `memory.jsonl`) and Anchor will never overwrite your changes.
  This makes "state.json is machine-specific" self-enforcing in every repo
  Anchor touches.
- **If a secret still lands in a pushed commit**: it's compromised the
  moment it lands, regardless of scope — rotate the credential first.
  Force-pushing a fix and asking GitHub Support to purge caches is cleanup,
  not an undo; treat anything pushed to a remote as permanently exposed.
- **Upgrading from v0.1**: a generated `.gitignore` only stops files git
  isn't tracking yet. If `.anchor/state.json` was already committed before
  you upgraded, gitignore does nothing for it — untrack it once with
  `git rm --cached .anchor/state.json` and commit that.

## License

MIT
