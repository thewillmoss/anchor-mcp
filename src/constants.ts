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
// A single glob, not separate state.json / state.json.tmp lines: atomic
// writes now use a per-process-unique temp name (state.json.<pid>.<rand>.tmp),
// and a corrupt state.json gets preserved as state.json.corrupt — all of
// which must stay untracked, not just the two original literal names.
export const ANCHOR_GITIGNORE = `# machine-specific — do not commit
state.json*
`