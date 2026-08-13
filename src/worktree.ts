/**
 * Anchor MCP — Worktree and User-Scope Root Resolution
 *
 * Resolves both scope roots:
 * - Project scope: the git worktree root from the current working directory
 *   (normal repos, git worktrees, ANCHOR_STATE_DIR env override).
 * - User scope: `~/.anchor`, or ANCHOR_USER_DIR env override — never throws,
 *   since user-scope tools must work from anywhere, git repo or not.
 */

import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { ANCHOR_DIR, ANCHOR_STATE_DIR_ENV, ANCHOR_USER_DIR_ENV } from "./constants.js"

/**
 * Expand a leading "~" or "~/" to the user's home directory.
 *
 * MCP server configs are JSON (or TOML) env blocks with no shell in the
 * middle to do this expansion — a literal `ANCHOR_USER_DIR=~/.anchor` would
 * otherwise resolve to a `./~` directory relative to cwd.
 */
function expandTilde(path: string): string {
  if (path === "~") return homedir()
  if (path.startsWith("~/") || path.startsWith("~\\")) {
    return join(homedir(), path.slice(2))
  }
  return path
}

/**
 * Detect the git worktree root directory.
 *
 * Algorithm:
 * 1. Check ANCHOR_STATE_DIR env var (override for non-git dirs)
 * 2. Walk up from startDir looking for .git/ directory or .git file (worktree)
 * 3. Throw if no git root found
 */
export function detectWorktreeRoot(startDir: string = process.cwd()): string {
  const envOverride = process.env[ANCHOR_STATE_DIR_ENV]
  if (envOverride) {
    return resolve(expandTilde(envOverride))
  }

  let dir = resolve(startDir)
  let parent = dirname(dir)

  while (dir !== parent) {
    const gitPath = join(dir, ".git")
    if (existsSync(gitPath)) {
      return dir
    }
    dir = parent
    parent = dirname(dir)
  }


  throw new Error(
    "anchor-mcp: not inside a git repository. " +
    "Set ANCHOR_STATE_DIR env var to override."
  )
}

/**
 * Resolve the user-scope anchor root.
 *
 * Unlike project scope, this never throws — user-scope memory and notepad
 * tools must work from anywhere, git repo or not.
 *
 * Algorithm:
 * 1. Check ANCHOR_USER_DIR env var (override)
 * 2. Default to `~/.anchor`
 */
export function resolveUserAnchorDir(): string {
  const envOverride = process.env[ANCHOR_USER_DIR_ENV]
  if (envOverride) {
    return resolve(expandTilde(envOverride))
  }
  return join(homedir(), ANCHOR_DIR)
}
