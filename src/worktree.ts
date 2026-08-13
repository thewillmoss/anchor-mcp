/**
 * Anchor MCP — Worktree Detection
 *
 * Detects the git worktree root from the current working directory.
 * Supports: normal repos, git worktrees, ANCHOR_STATE_DIR env override.
 */

import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { ANCHOR_DIR, ANCHOR_USER_DIR_ENV } from "./constants.js"

/**
 * Detect the git worktree root directory.
 *
 * Algorithm:
 * 1. Check ANCHOR_STATE_DIR env var (override for non-git dirs)
 * 2. Walk up from startDir looking for .git/ directory or .git file (worktree)
 * 3. Throw if no git root found
 */
export function detectWorktreeRoot(startDir: string = process.cwd()): string {
  const envOverride = process.env.ANCHOR_STATE_DIR
  if (envOverride) {
    return resolve(envOverride)
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
    return resolve(envOverride)
  }
  return join(homedir(), ANCHOR_DIR)
}