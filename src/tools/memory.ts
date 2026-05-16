/**
 * Anchor MCP — Memory Manager Tool
 *
 * Manages persistent learnings, decisions, and patterns.
 * Memory is stored as append-only JSONL.
 */

import { z } from "zod"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { AnchorStore } from "../store.js"

const MemoryAction = z.enum(["add", "search", "list"])

const MemoryManagerSchema = {
  action: MemoryAction.describe("The memory action to perform"),
  content: z.string().optional().describe("Memory content (required for add)"),
  tags: z.array(z.string()).optional().describe("Tags for categorization (for add)"),
  query: z.string().optional().describe("Search query (required for search)"),
  limit: z.number().optional().describe("Max results to return (for search/list, default 20)"),
}

export function registerMemoryTools(server: McpServer, store: AnchorStore): void {
  server.tool(
    "memory_manager",
    "Manage memory: add a learning/decision, search memories, or list recent memories.",
    MemoryManagerSchema,
    async (params) => {
      try {
        switch (params.action) {
          case "add": {
            if (!params.content) {
              return { content: [{ type: "text" as const, text: "Error: content is required for add" }] }
            }
            const entry = store.addMemory(params.content, params.tags)
            return { content: [{ type: "text" as const, text: JSON.stringify(entry, null, 2) }] }
          }
          case "search": {
            if (!params.query) {
              return { content: [{ type: "text" as const, text: "Error: query is required for search" }] }
            }
            const results = store.searchMemory(params.query, params.limit ?? 20)
            return {
              content: results.length > 0
                ? [{ type: "text" as const, text: JSON.stringify(results, null, 2) }]
                : [{ type: "text" as const, text: "No matching memories." }],
            }
          }
          case "list": {
            const entries = store.readMemory()
            const limit = params.limit ?? 20
            const recent = entries.slice(-limit)
            return {
              content: recent.length > 0
                ? [{ type: "text" as const, text: JSON.stringify(recent, null, 2) }]
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