/**
 * Anchor MCP — Notepad Manager Tool
 *
 * Manages freeform scratch notes organized by topic, split across two
 * scopes: user (~/.anchor, default — private) and project
 * (<worktree>/.anchor, opt-in — shared with the team via git).
 */

import { z } from "zod"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { AnchorStore } from "../store.js"
import type { Scope } from "../types.js"

const NotepadAction = z.enum(["get", "save", "list"])
const ScopeSchema = z.enum(["user", "project"])

const NotepadManagerSchema = {
  action: NotepadAction.describe("The notepad action to perform"),
  topic: z.string().optional().describe("Notepad topic name (required for get and save)"),
  content: z.string().optional().describe("Notepad content in markdown (required for save)"),
  scope: ScopeSchema.optional().describe(
    "'user' (default) is private, stored in ~/.anchor, never committed; 'project' is shared via " +
      "the repo's .anchor/. 'save' defaults to 'user'. 'get' without a scope checks user first, " +
      "then falls back to project."
  ),
}

/** Project-scope reads must degrade to null/empty, not error, outside a git repo. */
function tryGet(fn: () => string | null): string | null {
  try {
    return fn()
  } catch {
    return null
  }
}

function tryList(fn: () => string[]): string[] {
  try {
    return fn()
  } catch {
    return []
  }
}

export function registerNotepadTools(server: McpServer, projectStore: AnchorStore, userStore: AnchorStore): void {
  server.tool(
    "notepad_manager",
    "Manage notepads: read a notepad by topic, save/update a notepad, or list all topics. " +
      "'save' defaults to user scope (private, ~/.anchor); pass scope='project' to share it via git. " +
      "'get' without a scope checks user first, then falls back to project. " +
      "'list' returns { user: string[], project: string[] }.",
    NotepadManagerSchema,
    async (params) => {
      try {
        switch (params.action) {
          case "get": {
            if (!params.topic) {
              return { content: [{ type: "text" as const, text: "Error: topic is required for get" }] }
            }
            if (params.scope) {
              const store = params.scope === "project" ? projectStore : userStore
              const content = store.getNotepad(params.topic)
              return {
                content: content
                  ? [{ type: "text" as const, text: content }]
                  : [{ type: "text" as const, text: `Notepad '${params.topic}' not found in ${params.scope} scope.` }],
              }
            }
            const userContent = tryGet(() => userStore.getNotepad(params.topic!))
            if (userContent) {
              return { content: [{ type: "text" as const, text: userContent }] }
            }
            const projectContent = tryGet(() => projectStore.getNotepad(params.topic!))
            return {
              content: projectContent
                ? [{ type: "text" as const, text: projectContent }]
                : [{ type: "text" as const, text: `Notepad '${params.topic}' not found.` }],
            }
          }
          case "save": {
            if (!params.topic || !params.content) {
              return { content: [{ type: "text" as const, text: "Error: topic and content are required for save" }] }
            }
            const scope: Scope = params.scope ?? "user"
            const store = scope === "project" ? projectStore : userStore
            store.saveNotepad(params.topic, params.content)
            return { content: [{ type: "text" as const, text: `Notepad '${params.topic}' saved (${scope} scope).` }] }
          }
          case "list": {
            const user = tryList(() => userStore.listNotepads())
            const project = tryList(() => projectStore.listNotepads())
            return {
              content: user.length > 0 || project.length > 0
                ? [{ type: "text" as const, text: JSON.stringify({ user, project }, null, 2) }]
                : [{ type: "text" as const, text: "No notepads." }],
            }
          }
        }
      } catch (error) {
        return { content: [{ type: "text" as const, text: `Error: ${error}` }] }
      }
    }
  )
}
