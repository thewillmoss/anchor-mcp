# anchor-mcp

A portable agent working state server. Any AI coding agent drops anchor here.

Anchor is an [MCP server](https://modelcontextprotocol.io) that manages
persistent working state for AI coding agents — tasks, plans, scratch notes,
learnings, and project rules. It works with Claude Code, OpenCode, Codex CLI,
Cursor, Windsurf, or any MCP-compatible agent.

> **Status: early, and in daily use.** I run Anchor across Claude Code, Codex CLI,
> and OpenCode every day; it is the reason it exists. The surface is small and
> stable — 6 grouped tools, atomic writes, 22 tests. Expect the tool schemas to
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

### Usage examples

**Set an active task:**
```
task_manager(action="set_active", description="Implement user authentication")
```

**Save a plan:**
```
plan_manager(action="save", name="auth-flow", content="# Auth Flow Plan\n\n1. Add login endpoint\n2. Add JWT middleware")
```

**Add a memory:**
```
memory_manager(action="add", content="Always use httpOnly cookies for JWT", tags=["auth", "security"])
```

**Search memories:**
```
memory_manager(action="search", query="authentication")
```

## State directory

Anchor stores state in `.anchor/` at your project root:

```
.anchor/
├── state.json              # Active task + task list (gitignored)
├── plans/
│   └── {plan-name}/
│       ├── plan.md
│       ├── issues.md
│       └── learnings.md
├── notepads/
│   └── {topic}.md
├── memory.jsonl
└── rules.md
```

Plans, notepads, rules, and memory are designed to be committed to git.
`state.json` is machine-specific and should be gitignored.

## License

MIT
