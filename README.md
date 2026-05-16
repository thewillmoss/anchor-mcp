# anchor-mcp

A portable agent working state server. Any AI coding agent drops anchor here.

Anchor is an [MCP server](https://modelcontextprotocol.io) that manages
persistent working state for AI coding agents — tasks, plans, scratch notes,
learnings, and project rules. It works with Claude Code, OpenCode, Codex CLI,
Cursor, Windsurf, or any MCP-compatible agent.

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
npm install -g anchor-mcp
```

### Configure (Claude Code)

Add to `.claude/.mcp.json`:

```json
{
  "mcpServers": {
    "anchor": {
      "command": "anchor-mcp"
    }
  }
}
```

### Configure (OpenCode / oh-my-openagent)

Add to `.opencode/oh-my-openagent.json`:

```json
{
  "mcpServers": {
    "anchor": {
      "command": "anchor-mcp"
    }
  }
}
```

### Configure (Codex CLI)

Add to `.codex/config.toml`:

```toml
[mcp_servers.anchor]
command = "anchor-mcp"
```

## Tools

| Tool | Description |
|------|-------------|
| `get-active-task` | Get the current active task for this worktree |
| `set-active-task` | Set or update the active task |
| `complete-task` | Mark the active task as completed |
| `list-tasks` | List all tasks with optional status filter |
| `get-plan` | Read a plan by name |
| `save-plan` | Create or update a plan |
| `list-plans` | List all plan names |
| `get-notepad` | Read a notepad by topic |
| `append-notepad` | Append content to a notepad |
| `list-notepads` | List all notepad topics |
| `add-memory` | Store a learning, decision, or pattern |
| `list-memory` | Retrieve stored memory entries |
| `get-rules` | Read project agent rules |
| `save-rules` | Update project agent rules |
| `promote-learning` | Promote a learning to a project rule |

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
