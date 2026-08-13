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
import { ScopeSchema, pickStore, includeProjectScope } from "./shared.js"

const NotepadAction = z.enum(["get", "save", "list"])

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
              const store = pickStore(params.scope, projectStore, userStore)
              const content = store.getNotepad(params.topic)
              return {
                content: content !== null
                  ? [{ type: "text" as const, text: content }]
                  : [{ type: "text" as const, text: `Notepad '${params.topic}' not found in ${params.scope} scope.` }],
              }
            }
            const userContent = userStore.getNotepad(params.topic)
            if (userContent !== null) {
              return { content: [{ type: "text" as const, text: userContent }] }
            }
            const projectContent = includeProjectScope(projectStore, userStore)
              ? projectStore.getNotepad(params.topic)
              : null
            return {
              content: projectContent !== null
                ? [{ type: "text" as const, text: projectContent }]
                : [{ type: "text" as const, text: `Notepad '${params.topic}' not found.` }],
            }
          }
          case "save": {
            if (!params.topic || params.content === undefined) {
              return { content: [{ type: "text" as const, text: "Error: topic and content are required for save" }] }
            }
            const scope: Scope = params.scope ?? "user"
            pickStore(scope, projectStore, userStore).saveNotepad(params.topic, params.content)
            return { content: [{ type: "text" as const, text: `Notepad '${params.topic}' saved (${scope} scope).` }] }
          }
          case "list": {
            const user = userStore.listNotepads()
            const project = includeProjectScope(projectStore, userStore) ? projectStore.listNotepads() : []
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
