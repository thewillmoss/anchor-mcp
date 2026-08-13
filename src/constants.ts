/**
 * Anchor MCP Constants
 *
 * Directory and file names for .anchor/ state storage.
 */

export const ANCHOR_DIR = ".anchor"
export const STATE_FILE = "state.json"
export const MEMORY_FILE = "memory.jsonl"
export const RULES_FILE = "rules.md"
export const PLANS_DIR = "plans"
export const NOTEPADS_DIR = "notepads"
export const SCHEMA_VERSION = 1

// ── Project scope root override ───────────────────────────────────
export const ANCHOR_STATE_DIR_ENV = "ANCHOR_STATE_DIR"

// ── User scope (~/.anchor, overridable via ANCHOR_USER_DIR) ──────
export const ANCHOR_USER_DIR_ENV = "ANCHOR_USER_DIR"

// ── Self-enforcing gitignore, written into the project .anchor/ ──
export const GITIGNORE_FILE = ".gitignore"
export const ANCHOR_GITIGNORE = `# machine-specific — do not commit
state.json
state.json.tmp
`