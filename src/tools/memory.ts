/**
 * Anchor MCP — Memory Manager Tool
 *
 * Manages persistent learnings, decisions, and patterns.
 * Memory is stored as append-only JSONL, split across two scopes:
 * user (~/.anchor, default — private) and project (<worktree>/.anchor,
 * opt-in — shared with the team via git).
 */

import { z } from "zod"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { AnchorStore } from "../store.js"
import type { MemoryEntry, Scope } from "../types.js"

const MemoryAction = z.enum(["add", "search", "list"])
const ScopeSchema = z.enum(["user", "project"])

const MemoryManagerSchema = {
  action: MemoryAction.describe("The memory action to perform"),
  content: z.string().optional().describe("Memory content (required for add)"),
  tags: z.array(z.string()).optional().describe("Tags for categorization (for add)"),
  query: z.string().optional().describe("Search query (required for search)"),
  limit: z.number().optional().describe("Max results to return (for search/list, default 20)"),
  scope: ScopeSchema.optional().describe(
    "Where to write, for 'add' (default 'user'): 'user' stores in ~/.anchor — private, never " +
      "committed, follows you across projects. 'project' stores in the repo's .anchor/ — shared " +
      "with the team via git. Personal data (keys, client names, business numbers) belongs in " +
      "'user'. 'search' and 'list' ignore this and always check both scopes, labeling each result."
  ),
}

type ScopedMemoryEntry = MemoryEntry & { scope: Scope }

/** Project-scope reads must degrade to empty, not error, outside a git repo. */
function tryRead(fn: () => MemoryEntry[]): MemoryEntry[] {
  try {
    return fn()
  } catch {
    return []
  }
}

function mergeScoped(project: MemoryEntry[], user: MemoryEntry[]): ScopedMemoryEntry[] {
  const merged: ScopedMemoryEntry[] = [
    ...project.map(e => ({ ...e, scope: "project" as const })),
    ...user.map(e => ({ ...e, scope: "user" as const })),
  ]
  merged.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  return merged
}

export function registerMemoryTools(server: McpServer, projectStore: AnchorStore, userStore: AnchorStore): void {
  server.tool(
    "memory_manager",
    "Manage memory: add a learning/decision, search memories, or list recent memories. " +
      "'add' defaults to user scope (private, ~/.anchor); pass scope='project' to share it via git. " +
      "'search' and 'list' always merge both scopes, with each returned entry labeled by scope.",
    MemoryManagerSchema,
    async (params) => {
      try {
        switch (params.action) {
          case "add": {
            if (!params.content) {
              return { content: [{ type: "text" as const, text: "Error: content is required for add" }] }
            }
            const scope: Scope = params.scope ?? "user"
            const store = scope === "project" ? projectStore : userStore
            const entry = store.addMemory(params.content, params.tags)
            return { content: [{ type: "text" as const, text: JSON.stringify({ ...entry, scope }, null, 2) }] }
          }
          case "search": {
            if (!params.query) {
              return { content: [{ type: "text" as const, text: "Error: query is required for search" }] }
            }
            const limit = params.limit ?? 20
            const projectMatches = tryRead(() => projectStore.searchMemory(params.query!, Number.MAX_SAFE_INTEGER))
            const userMatches = userStore.searchMemory(params.query, Number.MAX_SAFE_INTEGER)
            const results = mergeScoped(projectMatches, userMatches).slice(-limit)
            return {
              content: results.length > 0
                ? [{ type: "text" as const, text: JSON.stringify(results, null, 2) }]
                : [{ type: "text" as const, text: "No matching memories." }],
            }
          }
          case "list": {
            const limit = params.limit ?? 20
            const projectEntries = tryRead(() => projectStore.readMemory())
            const userEntries = userStore.readMemory()
            const results = mergeScoped(projectEntries, userEntries).slice(-limit)
            return {
              content: results.length > 0
                ? [{ type: "text" as const, text: JSON.stringify(results, null, 2) }]
                : [{ type: "text" as const, text: "No memories." }],
            }
          }
        }
      } catch (error) {
        return { content: [{ type: "text" as const, text: `Error: ${error}` }] }
      }
    }
  )
}
