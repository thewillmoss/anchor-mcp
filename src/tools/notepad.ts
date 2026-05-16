/**
 * Anchor MCP — Notepad Manager Tool
 *
 * Manages freeform scratch notes organized by topic.
 */

import { z } from "zod"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { AnchorStore } from "../store.js"

const NotepadAction = z.enum(["get", "save", "list"])

const NotepadManagerSchema = {
  action: NotepadAction.describe("The notepad action to perform"),
  topic: z.string().optional().describe("Notepad topic name (required for get and save)"),
  content: z.string().optional().describe("Notepad content in markdown (required for save)"),
}

export function registerNotepadTools(server: McpServer, store: AnchorStore): void {
  server.tool(
    "notepad_manager",
    "Manage notepads: read a notepad by topic, save/update a notepad, or list all topics.",
    NotepadManagerSchema,
    async (params) => {
      try {
        switch (params.action) {
          case "get": {
            if (!params.topic) {
              return { content: [{ type: "text" as const, text: "Error: topic is required for get" }] }
            }
            const content = store.getNotepad(params.topic)
            return {
              content: content
                ? [{ type: "text" as const, text: content }]
                : [{ type: "text" as const, text: `Notepad '${params.topic}' not found.` }],
            }
          }
          case "save": {
            if (!params.topic || !params.content) {
              return { content: [{ type: "text" as const, text: "Error: topic and content are required for save" }] }
            }
            store.saveNotepad(params.topic, params.content)
            return { content: [{ type: "text" as const, text: `Notepad '${params.topic}' saved.` }] }
          }
          case "list": {
            const topics = store.listNotepads()
            return {
              content: topics.length > 0
                ? [{ type: "text" as const, text: topics.join("\n") }]
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