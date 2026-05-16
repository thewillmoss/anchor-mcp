/**
 * Anchor MCP — Rules Manager Tool
 *
 * Manages project-specific agent instructions and curated rules.
 * Rules is a plain markdown file that agents can read directly.
 */

import { z } from "zod"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { AnchorStore } from "../store.js"

const RulesAction = z.enum(["get", "save"])

const RulesManagerSchema = {
  action: RulesAction.describe("The rules action to perform"),
  content: z.string().optional().describe("Rules content in markdown (required for save)"),
}

export function registerRulesTools(server: McpServer, store: AnchorStore): void {
  server.tool(
    "rules_manager",
    "Manage project rules: read current rules or save/update rules.",
    RulesManagerSchema,
    async (params) => {
      try {
        switch (params.action) {
          case "get": {
            const rules = store.getRules()
            return {
              content: rules
                ? [{ type: "text" as const, text: rules }]
                : [{ type: "text" as const, text: "No rules file." }],
            }
          }
          case "save": {
            if (!params.content) {
              return { content: [{ type: "text" as const, text: "Error: content is required for save" }] }
            }
            store.saveRules(params.content)
            return { content: [{ type: "text" as const, text: "Rules saved." }] }
          }
        }
      } catch (error) {
        return { content: [{ type: "text" as const, text: `Error: ${error}` }] }
      }
    }
  )
}