/**
 * Anchor MCP — Shared scope-routing helpers for memory/notepad tools.
 */

import { z } from "zod"
import type { AnchorStore } from "../store.js"
import type { Scope } from "../types.js"

export const ScopeSchema = z.enum(["user", "project"])

/** Pick the store to write to for a given (optional) scope, defaulting to user. */
export function pickStore(scope: Scope | undefined, projectStore: AnchorStore, userStore: AnchorStore): AnchorStore {
  return scope === "project" ? projectStore : userStore
}

/**
 * Whether the project store should participate in a scope-merging read
 * (search/list, or notepad get's user-then-project fall-through).
 *
 * False when the project store is unavailable (outside a git repo — the
 * merge should silently degrade to user-only, not error) or when project
 * and user scope happen to resolve to the same directory (e.g. $HOME is
 * itself a git repo, or ANCHOR_STATE_DIR=$HOME) — merging in that case
 * would double-list every entry against itself.
 */
export function includeProjectScope(projectStore: AnchorStore, userStore: AnchorStore): boolean {
  if (!projectStore.available) return false
  if (projectStore.anchorDirPath === userStore.anchorDirPath) return false
  return true
}
