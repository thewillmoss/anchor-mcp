/**
 * Anchor MCP — Promote Learning Tool
 *
 * Promotes learnings from a plan's learnings.md into the project rules.
 */

import { z } from "zod"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { AnchorStore } from "../store.js"

const PromoteLearningSchema = {
  planName: z.string().describe("Name of the plan to promote learnings from"),
  learningIndex: z.number().optional().describe("Optional: specific learning index to promote (promotes all if omitted)"),
}

export function registerPromoteTool(server: McpServer, store: AnchorStore): void {
  server.tool(
    "promote_learning",
    "Promote learnings from a plan into project rules. Appends plan learnings to rules.md.",
    PromoteLearningSchema,
    async (params) => {
      try {
        const result = store.promoteLearning(params.planName, params.learningIndex)
        if (!result) {
          return {
            content: [{ type: "text" as const, text: `No learnings found for plan '${params.planName}'.` }],
          }
        }
        return {
          content: [{ type: "text" as const, text: `Learnings from '${params.planName}' promoted to rules.\n\n${result}` }],
        }
      } catch (error) {
        return { content: [{ type: "text" as const, text: `Error: ${error}` }] }
      }
    }
  )
}